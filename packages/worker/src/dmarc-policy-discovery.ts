import type { DmarcPolicySource } from "@mailguard/shared";
import type { Resolver } from "./resolver";

// DMARC policy discovery (RFC 9989 §4.10): where a Domain's DMARC policy
// record is found. This is the only place that knows how; the DMARC Check
// grades whatever record it returns.
//
// 1. `_dmarc.<Domain>`: a single DMARC record there is the Domain's own policy.
// 2. Otherwise the DNS Tree Walk (§4.10) walks up toward the root, at most 8
//    queries in all, stopping at a record with `psd=y` or `psd=n`.
// 3. The Organizational Domain is picked from what the walk found (§4.10.2),
//    and its record supplies the policy; failing that, a `psd=y` record does.

export type PolicyDiscovery =
  /** The single DMARC record at `policyDomain`. */
  | { kind: "found"; policyDomain: string; policySource: DmarcPolicySource; record: string }
  /** No applicable DMARC record. */
  | { kind: "none" }
  /** A lookup the walk needed failed or timed out. */
  | { kind: "undetermined" };

/** RFC 9989 §4.10: the walk makes at most this many queries, the Domain's own included. */
const MAX_QUERIES = 8;

export async function discoverDmarcPolicy(resolver: Resolver, domain: string): Promise<PolicyDiscovery> {
  const own = await lookupRecord(resolver, domain);
  if (own === "undetermined") return { kind: "undetermined" };
  if (own !== null) return { kind: "found", policyDomain: domain, policySource: "domain", record: own };

  // The DNS Tree Walk, from the Domain minus its leftmost label (or its 7-label suffix).
  const found: { name: string; record: string; psd: string }[] = [];
  let labels = domain.split(".");
  labels = labels.length >= MAX_QUERIES ? labels.slice(-(MAX_QUERIES - 1)) : labels.slice(1);
  for (; labels.length > 0; labels = labels.slice(1)) {
    const name = labels.join(".");
    const record = await lookupRecord(resolver, name);
    if (record === "undetermined") return { kind: "undetermined" };
    if (record === null) continue;
    const psd = psdOf(record);
    found.push({ name, record, psd });
    if (psd === "y" || psd === "n") break;
  }

  // §4.10.2: the Organizational Domain, from the records found (longest name first).
  const last = found.at(-1);
  if (!last) return { kind: "none" };
  if (last.psd === "y") {
    const organizationalDomain = domain.split(".").slice(-(last.name.split(".").length + 1)).join(".");
    const orgRecord = found.find((f) => f.name === organizationalDomain);
    if (orgRecord) return { kind: "found", policyDomain: orgRecord.name, policySource: "organizational-domain", record: orgRecord.record };
    return { kind: "found", policyDomain: last.name, policySource: "public-suffix-domain", record: last.record };
  }
  // psd=n marks its own domain; otherwise the record with the fewest labels wins. Either way, the last one found.
  return { kind: "found", policyDomain: last.name, policySource: "organizational-domain", record: last.record };
}

/** The single DMARC record at `_dmarc.<name>`, null if there is none (or several), or "undetermined". */
async function lookupRecord(resolver: Resolver, name: string): Promise<string | null | "undetermined"> {
  const outcome = await resolver.resolve(`_dmarc.${name}`, "TXT");
  if (outcome.kind === "error" || outcome.kind === "timeout") return "undetermined";
  const answers = outcome.kind === "answers" ? outcome.answers : [];
  const records = answers.filter(isDmarcRecord);
  // §4.10 steps 2 and 6: records not starting with v=DMARC1 are discarded, and several records mean none.
  return records.length === 1 ? records[0] : null;
}

/** A DMARC record starts with the `v=DMARC1` tag; the value is case-sensitive (RFC 9989 §4.7). */
function isDmarcRecord(txt: string): boolean {
  return /^[vV]\s*=\s*DMARC1\s*(;|$)/.test(txt.trim());
}

/** The record's `psd` tag value (`y`, `n` or the default `u`). */
function psdOf(record: string): string {
  const match = /(?:^|;)\s*psd\s*=\s*([^;\s]*)\s*(?:;|$)/i.exec(record);
  const value = match?.[1].toLowerCase();
  return value === "y" || value === "n" ? value : "u";
}
