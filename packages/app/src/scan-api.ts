import type { ScanResponse } from "@mailguard/shared";

// In production the Worker serves the App, so the API is same-origin; locally
// the Vite dev server proxies /api to `wrangler dev`. VITE_API_BASE is only
// needed if the App is ever served from a different origin than the API.
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

/** Thrown when the Scan API answers 429: this client is over its Scan limit. */
export class RateLimitedError extends Error {
  constructor() {
    super("Rate limited");
    this.name = "RateLimitedError";
  }
}

/** Calls `GET /api/scan` for a Domain. Takes the Domain only (ADR-0001). */
export async function fetchScan(domain: string): Promise<ScanResponse> {
  const response = await fetch(`${API_BASE}/api/scan?domain=${encodeURIComponent(domain)}`);
  if (response.status === 429) throw new RateLimitedError();
  if (!response.ok) throw new Error(`Scan failed with HTTP ${response.status}`);
  return response.json();
}
