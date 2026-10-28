import type { CheckResult, DmarcCheck, DmarcPolicy } from "@mailguard/shared";
import { discoverDmarcPolicy } from "../dmarc-policy-discovery";
import type { CheckModule } from "./check-module";

// Grading follows PRD §2.2 (DMARC), with RFC 9989 record semantics. Where the
// policy record is found lives in ../dmarc-policy-discovery.ts.

export const dmarcCheck: CheckModule<"dmarc"> = {
  kind: "dmarc",

  async run({ domain, resolver }): Promise<DmarcCheck> {
    const discovery = await discoverDmarcPolicy(resolver, domain);
    if (discovery.kind === "undetermined") {
      return report("inconclusive", "A DNS lookup needed to find this domain's DMARC policy failed or timed out, so MailGuard couldn't tell whether it has one.");
    }
    if (discovery.kind === "none") {
      return report("fail", "No DMARC record was found for this domain or any parent domain, so receiving servers aren't told to act on mail that fails SPF and DKIM. Anyone can spoof it without consequence.");
    }

    const { policyDomain, policySource, record } = discovery;
    const found = { policyDomain, policySource, record };
    const tags = parseTags(record);
    const inherited = policySource !== "domain";
    const p = policyTag(tags, "p");
    const sp = policyTag(tags, "sp");
    const np = policyTag(tags, "np");

    // RFC 9989 §4.10.1: an invalid p/sp/np means p=none if rua has a valid URI, else no DMARC processing at all.
    const invalid = p === "invalid" || sp === "invalid" || np === "invalid";
    if (invalid && !hasValidRua(tags)) {
      return report("fail", `The DMARC record at _dmarc.${policyDomain} has an invalid policy and no valid rua reporting address, so receiving servers apply no DMARC processing to this domain's mail.`, found);
    }
    // A missing p is treated as p=none (§4.7).
    const policy: DmarcPolicy = invalid ? "none" : ((inherited ? (sp ?? p) : p) ?? "none");
    const testMode = tags.get("t")?.toLowerCase() === "y";

    const subdomainPolicy = inherited && sp ? " (its sp= subdomain policy)" : "";
    const source = {
      domain: "This domain publishes its own DMARC policy.",
      "organizational-domain": `This domain inherits the DMARC policy of its Organizational Domain, ${policyDomain}${subdomainPolicy}.`,
      "public-suffix-domain": `This domain inherits the DMARC policy published for its public suffix, ${policyDomain}${subdomainPolicy}.`,
    }[policySource];
    const graded = { ...found, policy, testMode };

    if (policy === "none") {
      return report("warning", `${source} The policy is none${invalid ? " (the record's policy is invalid, so it is treated as none)" : ""}: receiving servers only report on spoofed mail and still deliver it. Move to quarantine or reject to enforce it.`, graded);
    }
    if (testMode) {
      return report("warning", `${source} The ${policy} policy is in test mode (t=y), so receiving servers apply one level less (${policy === "reject" ? "quarantine" : "none"}). Remove t=y to enforce it fully.`, graded);
    }
    return report("pass", `${source} The policy is ${policy}, so receiving servers ${policy === "reject" ? "reject" : "send to spam"} mail that spoofs this domain.`, graded);
  },

  inconclusive(explanation) {
    return report("inconclusive", explanation);
  },
};

function report(result: CheckResult, explanation: string, details: Partial<Omit<DmarcCheck, "kind" | "result" | "explanation">> = {}): DmarcCheck {
  return { kind: "dmarc", result, explanation, policyDomain: null, policySource: null, record: null, policy: null, testMode: false, ...details };
}

/**
 * The record's `tag=value` pairs, tag names lower-cased. RFC 9989 §4.7: syntax
 * errors are discarded, so malformed parts are skipped; for a repeated tag
 * (which the RFC doesn't address) the first occurrence counts.
 */
function parseTags(record: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of record.split(";")) {
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(part);
    if (!match) continue;
    const name = match[1].toLowerCase();
    if (!tags.has(name)) tags.set(name, match[2]);
  }
  return tags;
}

/** A policy tag's value: absent, a valid policy, or "invalid". */
function policyTag(tags: Map<string, string>, name: "p" | "sp" | "np"): DmarcPolicy | "invalid" | undefined {
  const value = tags.get(name)?.toLowerCase();
  if (value === undefined) return undefined;
  return value === "none" || value === "quarantine" || value === "reject" ? value : "invalid";
}

/** True when `rua` lists at least one syntactically valid URI (each optionally followed by `!size`). */
function hasValidRua(tags: Map<string, string>): boolean {
  return (tags.get("rua") ?? "").split(",").some((entry) => {
    const uri = entry.trim().replace(/!\d+[kmgt]?$/i, "");
    return /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(uri) && URL.canParse(uri);
  });
}
