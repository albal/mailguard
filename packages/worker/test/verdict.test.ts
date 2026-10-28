import { describe, expect, it } from "vitest";
import type { CheckResult } from "@mailguard/shared";
import type { RecordType } from "../src/resolver";
import type { DnsScript, ScriptedAnswer } from "./fake-resolver";
import { checkOf, scan } from "./scan-helpers";

// The Verdict is the worst Check Result across the Scan (PRD §2.3).
// Each row drives the Scan's Checks to the given results through DNS alone.

type Result = CheckResult;
type Records = Partial<Record<RecordType, ScriptedAnswer>>;

const mxRecords: Record<Result, Records> = {
  pass: { MX: ["10 mx.example.com"] },
  warning: { A: ["192.0.2.1"] },
  fail: {},
  inconclusive: { MX: "timeout" },
};

const spfRecords: Record<Result, Records> = {
  pass: { TXT: ["v=spf1 mx -all"] },
  warning: { TXT: ["v=spf1 mx ?all"] },
  fail: { TXT: ["v=spf1 +all"] },
  inconclusive: { TXT: "error" },
};

/** DNS for example.com whose MX and SPF Checks get the given results (DMARC passes). */
function dns(mx: Result, spf: Result): DnsScript {
  return {
    "example.com": { ...mxRecords[mx], ...spfRecords[spf] },
    "mx.example.com": { A: ["192.0.2.1"] },
    "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject"] },
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
