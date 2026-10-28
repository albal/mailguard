import type { Scan } from "@mailguard/shared";

// Pages and the Worker are separate origins in production; locally the Vite
// dev server proxies /api to `wrangler dev`.
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

/** Thrown when the Scan API answers 429: this client is over its Scan limit. */
export class RateLimitedError extends Error {
  constructor() {
    super("Rate limited");
    this.name = "RateLimitedError";
  }
}

/** Calls `GET /api/scan` for a Domain. Takes the Domain only (ADR-0001). */
export async function fetchScan(domain: string): Promise<Scan> {
  const response = await fetch(`${API_BASE}/api/scan?domain=${encodeURIComponent(domain)}`);
  if (response.status === 429) throw new RateLimitedError();
  if (!response.ok) throw new Error(`Scan failed with HTTP ${response.status}`);
  return response.json();
}
