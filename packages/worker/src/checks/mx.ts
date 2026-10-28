import type { CheckResult, MxCheck } from "@mailguard/shared";
import { lookupMx } from "../mx";
import type { CheckModule } from "./check-module";

// Grading follows PRD §2.2 (MX).

export const mxCheck: CheckModule<"mx"> = {
  kind: "mx",

  async run({ domain, resolver }): Promise<MxCheck> {
    const found = await lookupMx(resolver, domain);
    switch (found.kind) {
      case "undetermined":
        return report("inconclusive", UNDETERMINED);
      case "null":
        return report("pass", "This domain publishes a Null MX (MX 0 .), declaring that it deliberately receives no email.", {
          nullMx: true,
        });
      case "implicit":
        if (found.addresses.length > 0) {
          return report(
            "warning",
            "This domain has no MX record, so senders fall back to its A/AAAA address (an implicit MX). Publish an MX record to say explicitly where mail should go.",
            { implicitMxAddresses: found.addresses },
          );
        }
        if (found.undetermined) return report("inconclusive", UNDETERMINED);
        return report("fail", "This domain has no MX record and no A/AAAA address, so email sent to it cannot be delivered.");
      case "hosts": {
        const { hosts } = found;
        if (hosts.some((h) => h.addresses.length > 0)) {
          return report("pass", "This domain's MX records point to mail servers that resolve, so email sent to it can be delivered.", {
            hosts,
          });
        }
        if (found.undetermined) return report("inconclusive", UNDETERMINED);
        return report("fail", "None of this domain's MX hosts resolve to an address, so email sent to it cannot be delivered.", {
          hosts,
        });
      }
    }
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
