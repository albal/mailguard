import type { CheckResult, MxCheck, MxHost } from "@mailguard/shared";
import type { Resolver, ResolveOutcome } from "../resolver";
import type { CheckModule } from "./check-module";

// Grading follows PRD §2.2 (MX).

export const mxCheck: CheckModule<"mx"> = {
  kind: "mx",

  async run({ domain, resolver }): Promise<MxCheck> {
    const mx = await resolver.resolve(domain, "MX");
    if (isUndetermined(mx)) return report("inconclusive", UNDETERMINED);
    const records = mx.kind === "answers" ? mx.answers.map(parseMx) : [];

    if (records.length === 1 && records[0].exchange === ".") {
      return report("pass", "This domain publishes a Null MX (MX 0 .), declaring that it deliberately receives no email.", {
        nullMx: true,
      });
    }

    if (records.length === 0) {
      const implicit = await lookupAddresses(resolver, domain);
      if (implicit.addresses.length > 0) {
        return report(
          "warning",
          "This domain has no MX record, so senders fall back to its A/AAAA address (an implicit MX). Publish an MX record to say explicitly where mail should go.",
          { implicitMxAddresses: implicit.addresses },
        );
      }
      if (implicit.undetermined) return report("inconclusive", UNDETERMINED);
      return report("fail", "This domain has no MX record and no A/AAAA address, so email sent to it cannot be delivered.");
    }

    const lookups = await Promise.all(records.map((r) => lookupAddresses(resolver, r.exchange)));
    const hosts: MxHost[] = records
      .map((r, i) => ({ preference: r.preference, exchange: r.exchange, addresses: lookups[i].addresses }))
      .sort((x, y) => x.preference - y.preference);

    if (hosts.some((h) => h.addresses.length > 0)) {
      return report("pass", "This domain's MX records point to mail servers that resolve, so email sent to it can be delivered.", {
        hosts,
      });
    }
    if (lookups.some((l) => l.undetermined)) return report("inconclusive", UNDETERMINED);
    return report("fail", "None of this domain's MX hosts resolve to an address, so email sent to it cannot be delivered.", {
      hosts,
    });
  },

  inconclusive(explanation) {
    return report("inconclusive", explanation);
  },
};

const UNDETERMINED = "The DNS lookups for this domain's mail servers failed or timed out, so MailGuard couldn't tell where its email goes.";

function report(
  result: CheckResult,
  explanation: string,
  details: Partial<Pick<MxCheck, "nullMx" | "hosts" | "implicitMxAddresses">> = {},
): MxCheck {
  return { kind: "mx", result, explanation, nullMx: false, hosts: [], implicitMxAddresses: [], ...details };
}

function isUndetermined(outcome: ResolveOutcome): boolean {
  return outcome.kind === "error" || outcome.kind === "timeout";
}

/** A and AAAA addresses of `name`, and whether any lookup failed to give an answer. */
async function lookupAddresses(resolver: Resolver, name: string): Promise<{ addresses: string[]; undetermined: boolean }> {
  const outcomes = await Promise.all([resolver.resolve(name, "A"), resolver.resolve(name, "AAAA")]);
  return {
    addresses: outcomes.flatMap((o) => (o.kind === "answers" ? o.answers : [])),
    undetermined: outcomes.some(isUndetermined),
  };
}

function parseMx(answer: string): { preference: number; exchange: string } {
  const [preference, exchange = ""] = answer.trim().split(/\s+/);
  return { preference: Number(preference), exchange: exchange.toLowerCase() };
}
