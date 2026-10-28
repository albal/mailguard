import { describe, expect, it } from "vitest";
import type { DnsScript } from "./fake-resolver";
import { allowOriginFor, SCAN_TIME, scan, scanRequest } from "./scan-helpers";

// The Cache API is shared by every test in this file, so each test scans its
// own Domain.

describe("Scan caching", () => {
  it("returns the cached Scan, with its original Scan time, for a repeat Scan within 5 minutes", async () => {
    const dns = { "cache-hit.test": { MX: ["0 ."] } };
    const first = await scan("cache-hit.test", dns, { now: () => SCAN_TIME, cache: caches.default });

    const second = await scan("cache-hit.test", dns, { now: () => SCAN_TIME + 60_000, cache: caches.default });

    expect(second.scannedAt).toBe(first.scannedAt);
    expect(second.scannedAt).toBe(new Date(SCAN_TIME).toISOString());
  });

  it("shares one entry between spellings of the same Domain", async () => {
    const dns = { "cache-spelling.test": { MX: ["0 ."] } };
    await scan("cache-spelling.test", dns, { now: () => SCAN_TIME, cache: caches.default });

    const second = await scan("Cache-Spelling.TEST.", dns, { now: () => SCAN_TIME + 60_000, cache: caches.default });

    expect(second.scannedAt).toBe(new Date(SCAN_TIME).toISOString());
  });

  it("caches the 200 for a Domain that doesn't exist", async () => {
    const url = scanUrl("cache-nxdomain.test");
    const dns = { "cache-nxdomain.test": "nxdomain" } as const;
    const first = await scanRequest(url, dns, { now: () => SCAN_TIME, cache: caches.default });
    await first.body?.cancel();

    const second = await scanRequest(url, {}, { now: () => SCAN_TIME + 60_000, cache: caches.default });

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      domain: "cache-nxdomain.test",
      scannedAt: new Date(SCAN_TIME).toISOString(),
      exists: false,
    });
  });

  it("doesn't cache an Incomplete Scan, so the next Scan tries again", async () => {
    const dns: DnsScript = {
      "cache-incomplete.test": { MX: ["0 ."], TXT: "timeout" },
      "_dmarc.cache-incomplete.test": { TXT: ["v=DMARC1; p=reject"] },
    };
    const first = await scan("cache-incomplete.test", dns, { now: () => SCAN_TIME, cache: caches.default });

    const second = await scan("cache-incomplete.test", dns, { now: () => SCAN_TIME + 60_000, cache: caches.default });

    expect(first.verdict).toBe("incomplete");
    expect(second.scannedAt).toBe(new Date(SCAN_TIME + 60_000).toISOString());
  });

  it("doesn't cache a Scan with any Inconclusive Check, even when its Verdict is worse", async () => {
    const dns: DnsScript = { "cache-partial.test": { MX: "timeout", TXT: ["v=spf1 +all"] } };
    const first = await scan("cache-partial.test", dns, { now: () => SCAN_TIME, cache: caches.default });

    const second = await scan("cache-partial.test", dns, { now: () => SCAN_TIME + 60_000, cache: caches.default });

    expect(first.verdict).toBe("high-risk");
    expect(second.scannedAt).toBe(new Date(SCAN_TIME + 60_000).toISOString());
  });

  it("doesn't cache the 400 for an invalid Domain", async () => {
    const response = await scanRequest(scanUrl("not a domain"), {}, { cache: caches.default });
    await response.body?.cancel();

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBeNull();
  });
});

function scanUrl(domain: string): string {
  return `https://api.mailguard.test/api/scan?domain=${encodeURIComponent(domain)}`;
}

/** A rate limiter that records its keys and allows only the first `allowed` calls. */
function fakeLimiter(allowed: number) {
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }: RateLimitOptions): Promise<RateLimitOutcome> {
      keys.push(key);
      return { success: keys.length <= allowed };
    },
  };
}

describe("Rate limiting", () => {
  it("answers 429 with an error body once the client IP is over its limit", async () => {
    const limiter = fakeLimiter(0);

    const response = await scanRequest(
      "https://api.mailguard.test/api/scan?domain=limited.test",
      {},
      { limiter },
      { headers: { "cf-connecting-ip": "203.0.113.7" } },
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toHaveProperty("error");
    expect(limiter.keys).toEqual(["203.0.113.7"]);
  });

  it("counts cached Scans against the limit too", async () => {
    const limiter = fakeLimiter(1);
    const deps = { limiter, cache: caches.default };
    const url = "https://api.mailguard.test/api/scan?domain=limited-cached.test";

    const first = await scanRequest(url, {}, deps);
    await first.body?.cancel();
    const second = await scanRequest(url, {}, deps);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    await second.body?.cancel();
  });
});

// ALLOWED_ORIGINS here is the production value from wrangler.jsonc. The
// preview environment's is tested in preview/cors.test.ts.
const PRODUCTION_ORIGIN = "https://mailguard.tsew.com";

describe("CORS (production configuration)", () => {
  it("allows the production origin", async () => {
    expect(await allowOriginFor(PRODUCTION_ORIGIN, { domain: "cors-prod.test" })).toBe(PRODUCTION_ORIGIN);
  });

  it("sends no allow header to any other origin, including other subdomains", async () => {
    expect(await allowOriginFor("https://evil.example", { domain: "cors-deny.test" })).toBeNull();
    expect(await allowOriginFor("https://feature-x.mailguard.tsew.com", { domain: "cors-deny.test" })).toBeNull();
    expect(await allowOriginFor("http://mailguard.tsew.com", { domain: "cors-deny.test" })).toBeNull();
  });

  it("allows the caller's origin on cached Scans and on 429s, so the App can read them", async () => {
    const cached = { cache: caches.default };
    await allowOriginFor("https://evil.example", { domain: "cors-cached.test", deps: cached });

    expect(await allowOriginFor(PRODUCTION_ORIGIN, { domain: "cors-cached.test", deps: cached })).toBe(PRODUCTION_ORIGIN);
    expect(await allowOriginFor(PRODUCTION_ORIGIN, { domain: "cors-429.test", deps: { limiter: fakeLimiter(0) } })).toBe(
      PRODUCTION_ORIGIN,
    );
  });
});
