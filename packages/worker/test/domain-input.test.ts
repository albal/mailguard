import { describe, expect, it } from "vitest";
import type { NonexistentDomain } from "@mailguard/shared";
import { fakeResolver } from "./fake-resolver";
import { SCAN_TIME, scan, scanRequest } from "./scan-helpers";

const scanUrl = (domain: string) => `https://api.mailguard.test/api/scan?domain=${encodeURIComponent(domain)}`;

describe("A Domain that doesn't exist", () => {
  it("returns 200 saying so, with no Checks and no Verdict", async () => {
    const response = await scanRequest(scanUrl("no-such-domain.example"), { "no-such-domain.example": "nxdomain" });

    expect(response.status).toBe(200);
    expect(await response.json<NonexistentDomain>()).toEqual({
      domain: "no-such-domain.example",
      scannedAt: new Date(SCAN_TIME).toISOString(),
      exists: false,
    });
  });

  it("runs no Checks: the existence pre-check is the only DNS query", async () => {
    const resolver = fakeResolver({ "no-such-domain.example": "nxdomain" });

    const response = await scanRequest(scanUrl("no-such-domain.example"), {}, { resolver });
    await response.body?.cancel();

    expect(resolver.queries).toHaveLength(1);
  });

  it.each(["error", "timeout", "hang"] as const)(
    "still runs every Check when the existence pre-check gets %s",
    async (outcome) => {
      const result = await scan("example.com", { "example.com": { A: outcome, MX: ["0 ."] } });

      expect(result.checks.map((c) => c.kind)).toContain("mx");
    },
  );
});
