import type { CheckResult, DmarcCheck, DmarcPolicy } from "@mailguard/shared";
import { discoverDmarcPolicy } from "../dmarc-policy-discovery";
import type { CheckModule } from "./check-module";

// Grading follows PRD §2.2 (DMARC), with RFC 7489 record semantics. Where the
// policy is looked up lives in ../dmarc-policy-discovery.ts.

export const dmarcCheck: CheckModule<"dmarc"> = {
  kind: "dmarc",

  async run({ domain, resolver }): Promise<DmarcCheck> {
    const discovery = await discoverDmarcPolicy(resolver, domain);
    if (discovery.kind === "undetermined") {
      return report("inconclusive", "The DNS lookup for this domain's DMARC record failed or timed out, so MailGuard couldn't tell whether it has a DMARC policy.");
    }
    if (discovery.kind === "none") {
      return report("fail", "No DMARC record was found for this domain or its parent domain, so receiving servers aren't told to act on mail that fails SPF and DKIM. Anyone can spoof it without consequence.");
    }

    const { policyDomain, inherited, record } = discovery;
    const found = { policyDomain, inherited, record };
    const tags = parseTags(record);
    const p = tags?.get("p")?.toLowerCase();
    const sp = tags?.get("sp")?.toLowerCase();
    const pctTag = tags?.get("pct");
    const pct = pctTag === undefined ? 100 : parsePct(pctTag);
    if (!tags || !isPolicy(p) || (sp !== undefined && !isPolicy(sp)) || pct === null) {
      return report("fail", `The DMARC record at _dmarc.${policyDomain} is invalid (it must start with v=DMARC1 and have a valid p= policy), so receiving servers ignore it.`, found);
    }

    const policy = inherited && sp !== undefined ? sp : p;
    const source = inherited
      ? `This domain inherits the DMARC policy of its Organizational Domain, ${policyDomain}${sp !== undefined ? " (its sp= subdomain policy)" : ""}.`
      : `This domain publishes its own DMARC policy.`;
    const graded = { ...found, policy, pct };

    if (policy === "none") {
      return report("warning", `${source} The policy is p=none: receiving servers only report on spoofed mail and still deliver it. Move to quarantine or reject to enforce it.`, graded);
    }
    if (pct < 100) {
      return report("warning", `${source} The ${policy} policy applies to only ${pct}% of failing mail (pct=${pct}); the rest is delivered. Raise pct to 100 for full enforcement.`, graded);
    }
    return report("pass", `${source} The policy is ${policy} for all mail, so receiving servers ${policy === "reject" ? "reject" : "send to spam"} mail that spoofs this domain.`, graded);
  },

  inconclusive(explanation) {
    return report("inconclusive", explanation);
  },
};

function report(result: CheckResult, explanation: string, details: Partial<Omit<DmarcCheck, "kind" | "result" | "explanation">> = {}): DmarcCheck {
  return { kind: "dmarc", result, explanation, policyDomain: null, inherited: false, record: null, policy: null, pct: null, ...details };
}

/** The record's `tag=value` pairs (tag names lower-cased), or null if it is malformed or repeats a tag. */
function parseTags(record: string): Map<string, string> | null {
  const tags = new Map<string, string>();
  for (const part of record.split(";")) {
    if (part.trim() === "") continue;
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(part);
    if (!match) return null;
    const name = match[1].toLowerCase();
    if (tags.has(name)) return null;
    tags.set(name, match[2]);
  }
  return tags;
}

function isPolicy(value: string | undefined): value is DmarcPolicy {
  return value === "none" || value === "quarantine" || value === "reject";
}

function parsePct(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const pct = Number(value);
  return pct <= 100 ? pct : null;
}
