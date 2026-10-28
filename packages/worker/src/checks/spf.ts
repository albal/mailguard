import type { CheckResult, SpfAllQualifier, SpfCheck } from "@mailguard/shared";
import type { Resolver } from "../resolver";
import { lookupSpfRecord, sendingIpsOf, type SpfRecord } from "../spf";
import type { CheckModule } from "./check-module";

// Grading follows PRD §2.2 (SPF).

export const spfCheck: CheckModule<"spf"> = {
  kind: "spf",

  async run({ domain, resolver }): Promise<SpfCheck> {
    const found = await lookupSpfRecord(resolver, domain);
    switch (found.kind) {
      case "undetermined":
        return report("inconclusive", UNDETERMINED);
      case "none":
        return report("fail", "This domain has no SPF record, so it doesn't say which servers may send its email.");
      case "multiple":
        return report(
          "fail",
          "This domain publishes more than one SPF record. Receivers treat that as an error and ignore SPF entirely; merge them into one record.",
          { records: found.texts },
        );
      case "invalid":
        return report(
          "fail",
          `This domain's SPF record has a syntax error (${found.error}), so receivers treat it as broken and ignore it.`,
          { records: [found.text] },
        );
    }

    const details = { records: [found.text], sendingIps: sendingIpsOf(found.record) };
    const walk = await walkLookups(resolver, found.record);
    if (walk.problem === "undetermined") return report("inconclusive", UNDETERMINED, details);
    if (walk.problem) return report("fail", walk.problem.explanation, { ...details, lookupCount: walk.lookups });
    if (walk.lookups > LOOKUP_LIMIT) {
      return report(
        "fail",
        `This domain's SPF record needs more than ${LOOKUP_LIMIT} DNS lookups (counting nested includes), so receivers give up on it with an error and SPF doesn't protect the domain.`,
        { ...details, lookupCount: walk.lookups },
      );
    }
    const { allQualifier } = walk;
    const [result, explanation] = ALL_GRADES[allQualifier ?? "none"];
    return report(result, explanation, { ...details, allQualifier, lookupCount: walk.lookups });
  },

  inconclusive(explanation) {
    return report("inconclusive", explanation);
  },
};

/** RFC 7208 §4.6.4: more DNS-querying terms than this across the whole evaluation is a permerror. */
const LOOKUP_LIMIT = 10;
const LOOKUP_TYPES = new Set(["include", "a", "mx", "ptr", "exists"]);

interface Walk {
  lookups: number;
  /** Why the record can't be evaluated: a permerror (Fail) or a DNS failure (Inconclusive). */
  problem?: { explanation: string } | "undetermined";
}

/**
 * Counts the DNS-querying terms of `record` and every record it includes or
 * redirects to, fetching them through the Resolver, and finds the effective
 * `all` (following `redirect=` when the record has no `all`). Stops at the
 * first problem or once over the limit. Macro domain-specs are counted but not followed.
 */
async function walkLookups(
  resolver: Resolver,
  record: SpfRecord,
  walk: Walk = { lookups: 0 },
): Promise<Walk & { allQualifier: SpfAllQualifier | null }> {
  const done = (allQualifier: SpfAllQualifier | null = null) => Object.assign(walk, { allQualifier });
  for (const mechanism of record.mechanisms) {
    if (!LOOKUP_TYPES.has(mechanism.type)) continue;
    if (!count(walk)) return done();
    if (mechanism.type !== "include" || !mechanism.domainSpec || hasMacro(mechanism.domainSpec)) continue;
    const included = await follow(resolver, mechanism.domainSpec, "includes", walk);
    if (!included) return done();
    await walkLookups(resolver, included, walk);
    if (walk.problem || walk.lookups > LOOKUP_LIMIT) return done();
  }

  const all = record.mechanisms.find((m) => m.type === "all");
  if (all || record.redirect === undefined || hasMacro(record.redirect)) return done(all?.qualifier ?? null);
  if (!count(walk)) return done();
  const redirected = await follow(resolver, record.redirect, "redirects to", walk);
  if (!redirected) return done();
  const { allQualifier } = await walkLookups(resolver, redirected, walk);
  return done(allQualifier);
}

/** Macro domain-specs (`%{i}…`) depend on the message being checked, so they can't be followed statically. */
function hasMacro(domainSpec: string): boolean {
  return domainSpec.includes("%");
}

/** Counts one DNS-querying term; false once over the limit. */
function count(walk: Walk): boolean {
  walk.lookups += 1;
  return walk.lookups <= LOOKUP_LIMIT;
}

/** Fetches the SPF record at an include/redirect domain, recording any problem on `walk`. */
async function follow(resolver: Resolver, name: string, how: string, walk: Walk): Promise<SpfRecord | undefined> {
  const found = await lookupSpfRecord(resolver, name);
  if (found.kind === "record") return found.record;
  walk.problem =
    found.kind === "undetermined"
      ? "undetermined"
      : {
          explanation: `This domain's SPF record ${how} ${name}, which ${FOLLOWED_RECORD_PROBLEMS[found.kind]}, so receivers treat the SPF record as broken.`,
        };
  return undefined;
}

const FOLLOWED_RECORD_PROBLEMS = {
  none: "has no SPF record",
  multiple: "publishes more than one SPF record",
  invalid: "has an SPF syntax error",
} as const;

const UNDETERMINED =
  "The DNS lookups for this domain's SPF record failed or timed out, so MailGuard couldn't tell which servers may send its email.";

const PASS_EXPLANATION =
  "This domain's SPF record lists the servers allowed to send its email and tells receivers to reject or flag mail from anywhere else.";

/** How the effective `all` grades a record that is otherwise valid. */
const ALL_GRADES: Record<SpfAllQualifier | "none", [CheckResult, string]> = {
  "-": ["pass", PASS_EXPLANATION],
  "~": ["pass", PASS_EXPLANATION],
  "+": [
    "fail",
    "This domain's SPF record ends in +all, which authorises every server on the internet to send its email.",
  ],
  "?": [
    "warning",
    "This domain's SPF record ends in ?all, a neutral policy: receivers are told nothing about mail from servers it doesn't list, so spoofed mail isn't flagged.",
  ],
  none: [
    "warning",
    'This domain\'s SPF record has no "all" mechanism, so receivers are told nothing about mail from servers it doesn\'t list. End it with -all or ~all.',
  ],
};

function report(
  result: CheckResult,
  explanation: string,
  details: Partial<Pick<SpfCheck, "records" | "lookupCount" | "allQualifier" | "sendingIps">> = {},
): SpfCheck {
  return { kind: "spf", result, explanation, records: [], lookupCount: null, allQualifier: null, sendingIps: [], ...details };
}
