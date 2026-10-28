import type { SpfQualifier } from "@mailguard/shared";
import type { Resolver } from "./resolver";

// SPF records (RFC 7208 §4.5–§6, §7 macros, §12 ABNF): finding a domain's
// record through the Resolver, and parsing it. Shared by the SPF Check and the
// Blocklist Checks (Sending IPs).

/** What `lookupSpfRecord` found at a domain. */
export type SpfLookup =
  | { kind: "record"; text: string; record: SpfRecord }
  /** No `v=spf1` TXT record (including NXDOMAIN). */
  | { kind: "none" }
  | { kind: "multiple"; texts: string[] }
  | { kind: "invalid"; text: string; error: string }
  /** The TXT lookup errored or timed out. */
  | { kind: "undetermined" };

/** Fetches and parses the SPF record published at `domain`. */
export async function lookupSpfRecord(resolver: Resolver, domain: string): Promise<SpfLookup> {
  const txt = await resolver.resolve(domain, "TXT");
  if (txt.kind === "error" || txt.kind === "timeout") return { kind: "undetermined" };
  const texts = txt.kind === "answers" ? txt.answers.filter(isSpfRecord) : [];
  if (texts.length === 0) return { kind: "none" };
  if (texts.length > 1) return { kind: "multiple", texts };
  const parsed = parseSpf(texts[0]);
  return parsed.ok
    ? { kind: "record", text: texts[0], record: parsed.record }
    : { kind: "invalid", text: texts[0], error: parsed.error };
}

export type SpfMechanism =
  | { type: "all"; qualifier: SpfQualifier }
  /** `include`, `exists`: `domainSpec` is required. `a`, `mx`, `ptr`: absent means the current domain. */
  | { type: "include" | "exists" | "a" | "mx" | "ptr"; qualifier: SpfQualifier; domainSpec?: string }
  /** `prefixLength` is absent when no CIDR suffix was given. */
  | { type: "ip4" | "ip6"; qualifier: SpfQualifier; address: string; prefixLength?: number };

export interface SpfRecord {
  mechanisms: SpfMechanism[];
  /** Domain-spec of the `redirect=` modifier, if any. */
  redirect?: string;
}

export type ParsedSpf = { ok: true; record: SpfRecord } | { ok: false; error: string };

/** Whether a TXT string is an SPF record (`v=spf1`, alone or followed by a space; RFC 7208 §4.5). */
export function isSpfRecord(txt: string): boolean {
  return /^v=spf1( |$)/i.test(txt);
}

/** Parses an SPF record's terms, failing on anything RFC 7208 calls a permerror at parse time. */
export function parseSpf(text: string): ParsedSpf {
  const mechanisms: SpfMechanism[] = [];
  const modifiers = new Map<string, string>();
  for (const term of text.split(" ").slice(1)) {
    if (term === "") continue;
    const modifier = /^([a-z][a-z0-9_.-]*)=(.*)$/i.exec(term);
    if (modifier) {
      const name = modifier[1].toLowerCase();
      if ((name === "redirect" || name === "exp") && (modifiers.has(name) || !isDomainSpec(modifier[2]))) {
        return invalid(term);
      }
      modifiers.set(name, modifier[2]);
      continue;
    }
    const mechanism = parseMechanism(term);
    if (!mechanism) return invalid(term);
    mechanisms.push(mechanism);
  }
  return { ok: true, record: { mechanisms, redirect: modifiers.get("redirect") } };
}

/**
 * Sending IPs of a record: its single-address `ip4:` (no prefix or `/32`) and
 * `ip6:` (no prefix or `/128`) mechanisms that authorise (`+`) a sender.
 * Ranges, and anything reached through `include:` or `redirect=`, are left out.
 */
export function sendingIpsOf(record: SpfRecord): string[] {
  return record.mechanisms.flatMap((m) =>
    (m.type === "ip4" && (m.prefixLength ?? 32) === 32) || (m.type === "ip6" && (m.prefixLength ?? 128) === 128)
      ? m.qualifier === "+"
        ? [m.address]
        : []
      : [],
  );
}

function invalid(term: string): ParsedSpf {
  return { ok: false, error: `"${term}" is not valid SPF` };
}

function parseMechanism(term: string): SpfMechanism | undefined {
  const qualifier: SpfQualifier = "+-~?".includes(term[0]) ? (term[0] as SpfQualifier) : "+";
  const body = qualifier === term[0] ? term.slice(1) : term;
  const [, rawName, rest] = /^([a-z0-9]*)(.*)$/i.exec(body)!;
  const name = rawName.toLowerCase();

  switch (name) {
    case "all":
      return rest === "" ? { type: "all", qualifier } : undefined;
    case "include":
    case "exists": {
      const domainSpec = rest.startsWith(":") ? rest.slice(1) : "";
      return isDomainSpec(domainSpec) ? { type: name, qualifier, domainSpec } : undefined;
    }
    case "ptr": {
      if (rest === "") return { type: name, qualifier };
      const domainSpec = rest.startsWith(":") ? rest.slice(1) : "";
      return isDomainSpec(domainSpec) ? { type: name, qualifier, domainSpec } : undefined;
    }
    case "a":
    case "mx": {
      const match = /^(?::([^/]+))?(?:\/(\d+))?(?:\/\/(\d+))?$/.exec(rest);
      if (!match) return undefined;
      const [, domainSpec, cidr4, cidr6] = match;
      if (domainSpec !== undefined && !isDomainSpec(domainSpec)) return undefined;
      if (!isPrefixLength(cidr4, 32) || !isPrefixLength(cidr6, 128)) return undefined;
      return domainSpec === undefined ? { type: name, qualifier } : { type: name, qualifier, domainSpec };
    }
    case "ip4":
    case "ip6": {
      const match = /^:([^/]+)(?:\/(\d+))?$/.exec(rest);
      if (!match) return undefined;
      const [, address, prefix] = match;
      const valid = name === "ip4" ? isIpv4(address) : isIpv6(address);
      if (!valid || !isPrefixLength(prefix, name === "ip4" ? 32 : 128)) return undefined;
      return prefix === undefined
        ? { type: name, qualifier, address }
        : { type: name, qualifier, address, prefixLength: Number(prefix) };
    }
    default:
      return undefined;
  }
}

function isPrefixLength(text: string | undefined, max: number): boolean {
  return text === undefined || (/^\d{1,3}$/.test(text) && Number(text) <= max);
}

/** A domain-spec (RFC 7208 §7.1): visible characters, with `%` only as a macro (`%{…}`, `%%`, `%_`, `%-`). */
function isDomainSpec(text: string): boolean {
  if (text === "" || !/^[\x21-\x7e]+$/.test(text)) return false;
  return /^(?:[^%]|%%|%_|%-|%\{[slodiphcrtv]\d*r?[.\-+,/_=]*\})+$/i.test(text);
}

function isIpv4(text: string): boolean {
  const parts = text.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isIpv6(text: string): boolean {
  let hex = text;
  if (text.includes(".")) {
    // An embedded IPv4 tail (e.g. `::ffff:192.0.2.1`) stands for two groups.
    const lastColon = text.lastIndexOf(":");
    if (!isIpv4(text.slice(lastColon + 1))) return false;
    hex = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = hex.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half === "" ? [] : half.split(":")));
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return halves.length === 2 ? groups.length < 8 : groups.length === 8;
}
