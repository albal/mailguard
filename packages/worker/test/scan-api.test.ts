import { describe, expect, it } from "vitest";
import { SCAN_TIME, scan, scanRequest } from "./scan-helpers";

describe("GET /api/scan", () => {
  it("returns the Scan with its Domain, Scan time and one entry per Check", async () => {
    const result = await scan("example.com", { "example.com": { MX: ["0 ."] } });

    expect(result.domain).toBe("example.com");
    expect(result.scannedAt).toBe(new Date(SCAN_TIME).toISOString());
    expect(result.checks.map((c) => c.kind)).toContain("mx");
  });

  it("returns JSON", async () => {
    const response = await scanRequest("https://api.mailguard.test/api/scan?domain=example.com");

    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    await response.body?.cancel();
  });

  it("rejects a request without a Domain with a 400", async () => {
    const response = await scanRequest("https://api.mailguard.test/api/scan");

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });

  it("answers 404 for any other path", async () => {
    const response = await scanRequest("https://api.mailguard.test/api/other?domain=example.com");

    expect(response.status).toBe(404);
    await response.body?.cancel();
  });
});
