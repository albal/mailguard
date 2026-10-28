import { describe, expect, it } from "vitest";
import { scanRequest } from "./scan-helpers";

// The real `SCAN_LIMITER` binding from wrangler.jsonc (10 Scans a minute per
// IP), not a fake. Each test uses its own client IP so no other Scan in the
// run counts against it.

async function scanFrom(ip: string): Promise<number> {
  const response = await scanRequest(
    "https://api.mailguard.test/api/scan?domain=rate-limit.test",
    { "rate-limit.test": { MX: ["0 ."] } },
    { limiter: undefined },
    { headers: { "cf-connecting-ip": ip } },
  );
  await response.body?.cancel();
  return response.status;
}

describe("The configured rate limit", () => {
  it("allows 10 Scans a minute from one IP and answers the 11th with 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push(await scanFrom("198.51.100.11"));

    expect(statuses).toEqual([...Array(10).fill(200), 429]);
  });

  it("limits each IP separately", async () => {
    for (let i = 0; i < 11; i++) await scanFrom("198.51.100.21");

    expect(await scanFrom("198.51.100.22")).toBe(200);
  });
});
