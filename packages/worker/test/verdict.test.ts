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

/** DNS for example.com whose MX and SPF Checks get the given results. */
function dns(mx: Result, spf: Result): DnsScript {
  return {
    "example.com": { ...mxRecords[mx], ...spfRecords[spf] },
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

// Blocklist Check results for the Receiving IP 192.0.2.1 (the MX host, or the implicit MX).
const blocklistRecords: Record<Exclude<Result, "warning">, DnsScript> = {
  pass: {
    "1.2.0.192.bl.spamcop.net": "nxdomain",
    "1.2.0.192.psbl.surriel.com": "nxdomain",
    "1.2.0.192.bl.mailspike.net": "nxdomain",
  },
  fail: {
    "1.2.0.192.bl.spamcop.net": { A: ["127.0.0.2"] },
    "1.2.0.192.psbl.surriel.com": "nxdomain",
    "1.2.0.192.bl.mailspike.net": "nxdomain",
  },
  inconclusive: {
    "1.2.0.192.bl.spamcop.net": { A: "error" },
    "1.2.0.192.psbl.surriel.com": "nxdomain",
    "1.2.0.192.bl.mailspike.net": "nxdomain",
  },
};

describe("Verdict with Blocklists", () => {
  it.each([
    ["pass", "pass", "pass", "well-configured"],
    ["pass", "pass", "fail", "high-risk"],
    ["pass", "pass", "inconclusive", "incomplete"],
    ["warning", "pass", "inconclusive", "at-risk"],
    ["pass", "warning", "fail", "high-risk"],
  ] as const)("with MX %s, SPF %s and Blocklists %s is %s", async (mxResult, spfResult, blocklistResult, verdict) => {
    const result = await scan("example.com", { ...dns(mxResult, spfResult), ...blocklistRecords[blocklistResult] });

    expect(checkOf(result, "mx").result).toBe(mxResult);
    expect(checkOf(result, "spf").result).toBe(spfResult);
    expect(checkOf(result, "blocklists").result).toBe(blocklistResult);
    expect(result.verdict).toBe(verdict);
  });
});
