import type { ScanResponse } from "@mailguard/shared";

// Pages and the Worker are separate origins in production; locally the Vite
// dev server proxies /api to `wrangler dev`.
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

/** Calls `GET /api/scan` for a Domain. Takes the Domain only (ADR-0001). */
export async function fetchScan(domain: string): Promise<ScanResponse> {
  const response = await fetch(`${API_BASE}/api/scan?domain=${encodeURIComponent(domain)}`);
  if (!response.ok) throw new Error(`Scan failed with HTTP ${response.status}`);
  return response.json();
}
