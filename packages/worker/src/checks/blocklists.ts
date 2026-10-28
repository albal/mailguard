import type { BlocklistCheck, BlocklistLookup, BlocklistOutcome, BlocklistSubjectRole } from "@mailguard/shared";
import { blocklists, queryNameOf, type Blocklist } from "../blocklists";
import { isIpv6 } from "../ip-address";
import { lookupMx, receivingIpsOf } from "../mx";
import { lookupSpfRecord, sendingIpsOf } from "../spf";
import { beforeDeadline, reporter, type CheckContext, type CheckModule } from "./check-module";

// PRD §2.2 (Blocklists): the Domain, its Sending IPs and its Receiving IPs,
// looked up on every configured Blocklist. Any listing is a Fail.
// Checks run concurrently, so this finds the IPs itself rather than reading
// the SPF and MX Checks' results.

const report = reporter("blocklists", { blocklists: [], lookups: [] });

export const blocklistCheck: CheckModule<"blocklists"> = {
  kind: "blocklists",
  report,

  async run(context): Promise<BlocklistCheck> {
    const { domain, deadline } = context;
    // The Domain needs no discovery, so its lookups start straight away.
    const domainLookups = lookupsOf({ subject: domain, roles: ["domain"] }, context);
    const ips = await beforeDeadline(ipSubjectsOf(context), deadline, () => ({ subjects: [], undetermined: true }));
    const ipLookups = ips.subjects.flatMap((subject) => lookupsOf(subject, context));
    const lookups = await Promise.all([...domainLookups, ...ipLookups]);
    const { undetermined } = ips;

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
};

const UNDETERMINED =
  "Some Blocklist lookups failed, were refused or timed out, so MailGuard couldn't tell whether this domain's mail servers are listed.";

interface Subject {
  subject: string;
  roles: BlocklistSubjectRole[];
}

/**
 * Every Blocklist lookup of `subject`, all started at once. A lookup still
 * running at the deadline is Inconclusive; the others keep their outcome.
 */
function lookupsOf({ subject, roles }: Subject, context: CheckContext): Promise<BlocklistLookup>[] {
  return blocklists
    .filter((b) => (b.lists === "domain") === roles.includes("domain"))
    .map(async (blocklist): Promise<BlocklistLookup> => ({
      blocklist: blocklist.name,
      subject,
      roles,
      outcome: await beforeDeadline(
        outcomeOf(blocklist, subject, context).catch((): BlocklistOutcome => "inconclusive"),
        context.deadline,
        () => "inconclusive",
      ),
    }));
}

/**
 * The Domain's Sending IPs (single `ip4:`/`ip6:` addresses in SPF) and
 * Receiving IPs (MX host addresses), each IP once with all its roles.
 * `undetermined` when a DNS failure may have hidden some IPs.
 */
async function ipSubjectsOf({ domain, resolver }: CheckContext): Promise<{ subjects: Subject[]; undetermined: boolean }> {
  const [spf, mx] = await Promise.all([lookupSpfRecord(resolver, domain), lookupMx(resolver, domain)]);
  const sending = spf.kind === "record" ? sendingIpsOf(spf.record) : [];
  const receiving = receivingIpsOf(mx);

  const roles = new Map<string, BlocklistSubjectRole[]>();
  const add = (ip: string, role: BlocklistSubjectRole) => {
    const existing = roles.get(ip) ?? [];
    if (!existing.includes(role)) roles.set(ip, [...existing, role]);
  };
  sending.forEach((ip) => add(ip, "sending"));
  receiving.addresses.forEach((ip) => add(ip, "receiving"));

  return {
    subjects: [...roles].map(([subject, r]) => ({ subject, roles: r })),
    undetermined: spf.kind === "undetermined" || receiving.undetermined,
  };
}

async function outcomeOf(blocklist: Blocklist, subject: string, { resolver, dqsKey }: CheckContext): Promise<BlocklistOutcome> {
  if (blocklist.lists === "ip" && isIpv6(subject) && !blocklist.ipv6) return "not-applicable";
  // Without a key a DQS Blocklist can't be asked. Leaving it out would let a
  // misconfigured deployment report a better Verdict than it knows.
  if (blocklist.dqs && !dqsKey) return "inconclusive";
  const answer = await resolver.resolve(queryNameOf(blocklist, subject, dqsKey), "A");
  if (answer.kind === "nxdomain") return "not-listed";
  if (answer.kind !== "answers") return "inconclusive";
  if (answer.answers.some((code) => blocklist.listedCodes.includes(code))) return "listed";
  if (answer.answers.every((code) => blocklist.notListedCodes.includes(code))) return "not-listed";
  return "inconclusive";
}
