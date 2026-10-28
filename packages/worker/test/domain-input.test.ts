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

describe("Validating the Domain", () => {
  it.each([
    ["an email address", "alice@example.com"],
    ["a single label", "localhost"],
    ["an IP address", "192.0.2.1"],
    ["a space", "exa mple.com"],
    ["an empty label", "a..b.com"],
    ["a label starting with a hyphen", "-bad.com"],
    ["a label ending with a hyphen", "bad-.com"],
    ["an underscore", "a_b.example.com"],
    ["Unicode instead of Punycode", "bücher.de"],
    ["a port", "example.com:80"],
    ["a path", "example.com/path"],
    ["a label over 63 characters", `${"a".repeat(64)}.com`],
    ["a name over 253 characters", `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.com`],
    ["-- in positions 3-4 without xn", "ab--cd.com"],
  ])("rejects %s with a 400 and makes no DNS query", async (_, domain) => {
    const resolver = fakeResolver({});

    const response = await scanRequest(scanUrl(domain), {}, { resolver });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(resolver.queries).toEqual([]);
  });

  it.each([
    ["a Punycode Domain", "xn--bcher-kva.de", "xn--bcher-kva.de"],
    ["a subdomain", "mail.example.co.uk", "mail.example.co.uk"],
    ["upper case, normalised to lower case", "Example.COM", "example.com"],
    ["a trailing dot, which is dropped", "example.com.", "example.com"],
    ["digits and hyphens", "a-1.example.com", "a-1.example.com"],
  ])("accepts %s", async (_, domain, normalised) => {
    const result = await scan(domain, {});

    expect(result.domain).toBe(normalised);
  });
});
