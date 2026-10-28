import type { BlocklistCheck, BlocklistLookup, BlocklistOutcome, BlocklistTargetRole, CheckResult } from "@mailguard/shared";
import { blocklists, isIpv6, queryNameOf, type Blocklist } from "../blocklists";
import { lookupMx, receivingIpsOf } from "../mx";
import type { Resolver } from "../resolver";
import { lookupSpfRecord, sendingIpsOf } from "../spf";
import type { CheckContext, CheckModule } from "./check-module";

// PRD §2.2 (Blocklists): the Domain, its Sending IPs and its Receiving IPs,
// looked up on every configured Blocklist. Any listing is a Fail.
// Checks run concurrently, so this finds the IPs itself rather than reading
// the SPF and MX Checks' results.

export const blocklistCheck: CheckModule<"blocklists"> = {
  kind: "blocklists",

  async run(context): Promise<BlocklistCheck> {
    const { resolver, dqsKey } = context;
    const { targets, undetermined } = await targetsOf(context);

    const lookups = await Promise.all(
      targets.flatMap(({ target, roles }) =>
        blocklists
          .filter((b) => (b.lists === "domain") === roles.includes("domain"))
          .map(async (blocklist): Promise<BlocklistLookup> => ({
            blocklist: blocklist.name,
            target,
            roles,
            outcome: await outcomeOf(resolver, blocklist, target, dqsKey),
          })),
      ),
    );
    const applicable = lookups.filter((l) => l.outcome !== "not-applicable");
    const names = blocklists.map((b) => b.name).filter((name) => applicable.some((l) => l.blocklist === name));
    const listings = applicable.filter((l) => l.outcome === "listed").length;
    const details = { blocklists: names, lookups };

    if (listings > 0) {
      return report(
        "fail",
        `${listings === 1 ? "There is 1 listing" : `There are ${listings} listings`} for this domain's mail servers or name. Receivers using ${listings === 1 ? "that Blocklist" : "those Blocklists"} are likely to reject its email or mark it as spam.`,
        details,
      );
    }
    if (undetermined || applicable.some((l) => l.outcome === "inconclusive")) {
      return report("inconclusive", UNDETERMINED, details);
    }
    if (applicable.length === 0) {
      return report(
        "pass",
        "MailGuard found no mail server addresses for this domain to look up on Blocklists.",
        details,
      );
    }
    return report(
      "pass",
      `None of this domain's mail servers are listed on the ${names.length} Blocklists checked.`,
      details,
    );
  },

  inconclusive(explanation) {
    return report("inconclusive", explanation);
  },
};

const UNDETERMINED =
  "Some Blocklist lookups failed, were refused or timed out, so MailGuard couldn't tell whether this domain's mail servers are listed.";

interface Target {
  target: string;
  roles: BlocklistTargetRole[];
}

/**
 * The Domain, its Sending IPs (single `ip4:`/`ip6:` addresses in SPF) and its
 * Receiving IPs (MX host addresses), each IP once with all its roles.
 * `undetermined` when a DNS failure may have hidden some IPs.
 */
async function targetsOf({ domain, resolver }: CheckContext): Promise<{ targets: Target[]; undetermined: boolean }> {
  const [spf, mx] = await Promise.all([lookupSpfRecord(resolver, domain), lookupMx(resolver, domain)]);
  const sending = spf.kind === "record" ? sendingIpsOf(spf.record) : [];
  const receiving = receivingIpsOf(mx);

  const roles = new Map<string, BlocklistTargetRole[]>();
  const add = (ip: string, role: BlocklistTargetRole) => {
    const existing = roles.get(ip) ?? [];
    if (!existing.includes(role)) roles.set(ip, [...existing, role]);
  };
  sending.forEach((ip) => add(ip, "sending"));
  receiving.addresses.forEach((ip) => add(ip, "receiving"));

  return {
    targets: [{ target: domain, roles: ["domain"] }, ...[...roles].map(([target, r]) => ({ target, roles: r }))],
    undetermined: spf.kind === "undetermined" || receiving.undetermined,
  };
}

async function outcomeOf(resolver: Resolver, blocklist: Blocklist, target: string, dqsKey?: string): Promise<BlocklistOutcome> {
  if (blocklist.lists === "ip" && isIpv6(target) && !blocklist.ipv6) return "not-applicable";
  // Without a key a DQS Blocklist can't be asked. Leaving it out would let a
  // misconfigured deployment report a better Verdict than it knows.
  if (blocklist.dqs && !dqsKey) return "inconclusive";
  const answer = await resolver.resolve(queryNameOf(blocklist, target, dqsKey), "A");
  if (answer.kind === "nxdomain") return "not-listed";
  if (answer.kind !== "answers") return "inconclusive";
  if (answer.answers.some((code) => blocklist.listedCodes.includes(code))) return "listed";
  if (answer.answers.every((code) => blocklist.notListedCodes.includes(code))) return "not-listed";
  return "inconclusive";
}

function report(
  result: CheckResult,
  explanation: string,
  details: Partial<Pick<BlocklistCheck, "blocklists" | "lookups">> = {},
): BlocklistCheck {
  return { kind: "blocklists", result, explanation, blocklists: [], lookups: [], ...details };
}
