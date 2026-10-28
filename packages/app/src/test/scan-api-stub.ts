import type { Check, DmarcCheck, MxCheck, Scan } from "@mailguard/shared";
import { vi } from "vitest";

/** A Scan as the Worker would return it, with sensible defaults. */
export function aScan(overrides: Partial<Scan> = {}): Scan {
  return {
    domain: "example.com",
    scannedAt: "2026-10-28T12:00:00.000Z",
    verdict: "well-configured",
    checks: [anMxCheck()],
    ...overrides,
  };
}

export function anMxCheck(overrides: Partial<MxCheck> = {}): Check {
  return {
    kind: "mx",
    result: "pass",
    explanation: "This domain's MX records point to mail servers that resolve.",
    nullMx: false,
    hosts: [{ preference: 10, exchange: "mx.example.com", addresses: ["192.0.2.1"] }],
    implicitMxAddresses: [],
    ...overrides,
  };
}

export function aDmarcCheck(overrides: Partial<DmarcCheck> = {}): Check {
  return {
    kind: "dmarc",
    result: "pass",
    explanation: "This domain publishes its own DMARC policy.",
    policyDomain: "example.com",
    inherited: false,
    record: "v=DMARC1; p=reject",
    policy: "reject",
    pct: 100,
    ...overrides,
  };
}

/**
 * Stubs `fetch` for `/api/scan`. Pass a Scan to answer at once, or nothing to
 * get a request that stays pending until `respond` is called.
 */
export function stubScanApi(scan?: Scan) {
  let respond: (scan: Scan) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    respond = (body) => resolve(Response.json(body));
  });
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    scan ? Response.json(scan) : pending,
  );
  vi.stubGlobal("fetch", fetch);
  return {
    fetch,
    respond,
    /** URLs of every request made. */
    requestedUrls: () => fetch.mock.calls.map(([input]) => String(input)),
  };
}
