import { describe, expect, it } from "vitest";
import type { DnsScript } from "./fake-resolver";
import { checkOf, scan } from "./scan-helpers";

// The Verdict is the worst Check Result across the Scan (PRD §2.3).
// Each row drives the Scan's Checks to the given results through DNS alone.

/** DNS for example.com with an MX of the given result and an SPF record of the given result. */
function dns(mx: "pass" | "warning" | "fail" | "inconclusive", spf: "pass" | "warning" | "fail" | "inconclusive"): DnsScript {
  const mxRecords = {
    pass: { MX: ["10 mx.example.com"] },
    warning: { A: ["192.0.2.1"] },
    fail: {},
    inconclusive: { MX: "timeout" },
  } as const satisfies DnsScript[string];
  const spfRecords = {
    pass: { TXT: ["v=spf1 mx -all"] },
    warning: { TXT: ["v=spf1 mx ?all"] },
    fail: { TXT: ["v=spf1 +all"] },
    inconclusive: { TXT: "error" },
  } as const satisfies DnsScript[string];
  return {
    "example.com": { ...mxRecords[mx], ...spfRecords[spf] } as DnsScript[string],
    "mx.example.com": { A: ["192.0.2.1"] },
  };
}

describe("Verdict", () => {
  it.each([
    ["pass", "pass", "well-configured"],
    ["fail", "pass", "high-risk"],
    ["pass", "fail", "high-risk"],
    ["warning", "fail", "high-risk"],
    ["inconclusive", "fail", "high-risk"],
    ["warning", "pass", "at-risk"],
    ["pass", "warning", "at-risk"],
    ["inconclusive", "warning", "at-risk"],
    ["inconclusive", "pass", "incomplete"],
    ["pass", "inconclusive", "incomplete"],
  ] as const)("with MX %s and SPF %s is %s", async (mxResult, spfResult, verdict) => {
    const result = await scan("example.com", dns(mxResult, spfResult));

    expect(checkOf(result, "mx").result).toBe(mxResult);
    expect(checkOf(result, "spf").result).toBe(spfResult);
    expect(result.verdict).toBe(verdict);
  });
});
