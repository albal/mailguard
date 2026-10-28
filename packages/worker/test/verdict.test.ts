import { describe, expect, it } from "vitest";
import type { DnsScript } from "./fake-resolver";
import { scan } from "./scan-helpers";

// The Verdict is the worst Check Result across the Scan (PRD §2.3).
// Each row drives the Scan's Checks to the given worst result through DNS alone.
const resolvingMx: DnsScript = {
  "example.com": { MX: ["10 mx.example.com"] },
  "mx.example.com": { A: ["192.0.2.1"] },
};

describe("Verdict", () => {
  it("is Well Configured when every Check passes", async () => {
    expect((await scan("example.com", resolvingMx)).verdict).toBe("well-configured");
  });

  it("is High Risk when any Check fails", async () => {
    expect((await scan("example.com", {})).verdict).toBe("high-risk");
  });

  it("is At Risk when there are Warnings but no Fails", async () => {
    expect((await scan("example.com", { "example.com": { A: ["192.0.2.1"] } })).verdict).toBe("at-risk");
  });

  it("is Incomplete when a Check is Inconclusive and none fail or warn", async () => {
    expect((await scan("example.com", { "example.com": { MX: "timeout" } })).verdict).toBe("incomplete");
  });
});
