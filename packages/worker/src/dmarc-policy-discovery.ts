import { getDomain } from "tldts";
import type { Resolver } from "./resolver";

// DMARC policy discovery: where a Domain's DMARC record is found. This follows
// RFC 7489 §6.6.3 (the Domain, then its Organizational Domain via the Public
// Suffix List), as PRD §2.2 specifies. RFC 9989 replaces this with a DNS tree
// walk; swapping to it would be a change to this module alone.

export type PolicyDiscovery =
  /** A single DMARC record found at `policyDomain`; `inherited` when that is the Organizational Domain. */
  | { kind: "found"; policyDomain: string; inherited: boolean; record: string }
  /** No DMARC record at the Domain or its Organizational Domain. */
  | { kind: "none" }
  /** A lookup failed or timed out, so it is unknown whether a record exists. */
  | { kind: "undetermined" };

export async function discoverDmarcPolicy(resolver: Resolver, domain: string): Promise<PolicyDiscovery> {
  const own = await lookupRecord(resolver, domain);
  if (own.kind !== "none") return own;

  const organizationalDomain = getDomain(domain);
  if (!organizationalDomain || organizationalDomain === domain) return { kind: "none" };
  const inherited = await lookupRecord(resolver, organizationalDomain);
  return inherited.kind === "found" ? { ...inherited, inherited: true } : inherited;
}

async function lookupRecord(resolver: Resolver, domain: string): Promise<PolicyDiscovery> {
  const outcome = await resolver.resolve(`_dmarc.${domain}`, "TXT");
  if (outcome.kind === "error" || outcome.kind === "timeout") return { kind: "undetermined" };
  const answers = outcome.kind === "answers" ? outcome.answers : [];
  const records = answers.filter(isDmarcRecord);
  // RFC 7489 §6.6.3: anything other than exactly one DMARC record means no policy here.
  if (records.length !== 1) return { kind: "none" };
  return { kind: "found", policyDomain: domain, inherited: false, record: records[0] };
}

/** A DMARC record starts with the `v=DMARC1` tag (RFC 7489 §6.4: `v` must come first). */
function isDmarcRecord(txt: string): boolean {
  return /^v\s*=\s*DMARC1\s*(;|$)/.test(txt.trim());
}
