import { normaliseDomain } from "@mailguard/shared/domain-name";
import { toUnicode } from "punycode/";

export type DomainInput =
  | { ok: true; /** Punycode: the only form sent to the API. */ domain: string }
  | { ok: false; error: string };

const INVALID = "Enter a valid email address or domain, like you@example.com or example.com.";

/** Characters `new URL()` would quietly reinterpret (userinfo, port, path, escapes). */
const URL_SYNTAX = /[\s/\\:?#%[\]@]/;

/**
 * Turns what the user typed (an email address or a bare domain) into the
 * Domain. Everything up to and including the last `@` is dropped here and
 * never reaches the network (ADR-0001). Unicode is converted to Punycode.
 */
export function toDomain(input: string): DomainInput {
  const afterAt = input.trim().slice(input.trim().lastIndexOf("@") + 1);
  if (!afterAt || URL_SYNTAX.test(afterAt)) return { ok: false, error: INVALID };
  let ascii: string;
  try {
    ascii = new URL(`http://${afterAt}`).hostname;
  } catch {
    return { ok: false, error: INVALID };
  }
  // `new URL()` is lenient (it rewrites IPs, keeps underscores…), so its output is validated strictly.
  const domain = normaliseDomain(ascii);
  if (!domain) return { ok: false, error: INVALID };
  return { ok: true, domain };
}

/** The Domain for display: its Unicode form, followed by Punycode when the two differ. */
export function displayDomain(domain: string): string {
  const unicode = toUnicode(domain);
  return unicode === domain ? domain : `${unicode} (${domain})`;
}
