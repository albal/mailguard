import type { RecordType, ResolveOutcome, Resolver } from "./resolver";

// Production Resolver: Cloudflare DNS-over-HTTPS (1.1.1.1) JSON API.
// Uses the cloudflare-dns.com hostname: Workers can't reliably fetch Cloudflare's bare IPs.

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const TYPE_CODES: Record<RecordType, number> = { A: 1, MX: 15, TXT: 16, AAAA: 28 };
const NOERROR = 0;
const NXDOMAIN = 3;

export interface DohResolverOptions {
  fetch?: typeof fetch;
  /** Per-query timeout. */
  queryTimeoutMs?: number;
}

interface DohResponse {
  Status?: number;
  TC?: boolean;
  Answer?: { type: number; data: string }[];
}

export function createDohResolver({
  fetch: fetchFn = (input, init) => fetch(input, init),
  queryTimeoutMs = 1000,
}: DohResolverOptions = {}): Resolver {
  return {
    async resolve(name, type): Promise<ResolveOutcome> {
      const url = `${DOH_ENDPOINT}?${new URLSearchParams({ name, type })}`;
      let body: DohResponse;
      try {
        const response = await fetchFn(url, {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(queryTimeoutMs),
        });
        if (!response.ok) {
          await response.body?.cancel();
          return { kind: "error" };
        }
        body = await response.json();
      } catch (error) {
        return isTimeout(error) ? { kind: "timeout" } : { kind: "error" };
      }

      if (body.Status === NXDOMAIN) return { kind: "nxdomain" };
      if (body.Status !== NOERROR || body.TC) return { kind: "error" };
      const answers = (body.Answer ?? [])
        .filter((answer) => answer.type === TYPE_CODES[type])
        .map((answer) => normalise(type, answer.data));
      return { kind: "answers", answers };
    },
  };
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

function normalise(type: RecordType, data: string): string {
  switch (type) {
    case "MX": {
      const [preference, exchange = ""] = data.trim().split(/\s+/);
      return `${preference} ${stripTrailingDot(exchange)}`;
    }
    case "TXT":
      return joinCharacterStrings(data);
    default:
      return data.trim();
  }
}

function stripTrailingDot(name: string): string {
  return name.length > 1 && name.endsWith(".") ? name.slice(0, -1) : name;
}

/**
 * DoH returns TXT data in presentation form: quoted character-strings separated
 * by spaces. A record's strings are concatenated with no separator (RFC 7208 §3.3).
 */
function joinCharacterStrings(data: string): string {
  const strings = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => unescapeTxt(m[1]));
  return strings.length > 0 ? strings.join("") : data;
}

function unescapeTxt(text: string): string {
  return text.replace(/\\(\d{3}|.)/g, (_, escaped: string) =>
    escaped.length === 3 ? String.fromCharCode(Number(escaped)) : escaped,
  );
}
