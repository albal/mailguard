import type { ScanResponse } from "@mailguard/shared";

/** How long a Scan response is served from the edge cache. */
export const SCAN_CACHE_TTL_SECONDS = 300;

/**
 * Serves the Scan response for `domain` from the Workers Cache API, or runs
 * the Scan with `produce` and stores it for 5 minutes. `domain` must already
 * be normalised (`normaliseDomain`) so equivalent spellings share an entry.
 * Responses are stored without CORS headers (those depend on the caller's
 * Origin). A Scan with any Inconclusive Check isn't stored: DNS may answer
 * next time.
 *
 * The Cache API is a no-op on workers.dev: the Worker must sit on a custom
 * domain for hits to happen. Nothing depends on a hit for correctness.
 */
export async function cachedScanResponse(
  cache: Cache,
  domain: string,
  ctx: ExecutionContext,
  produce: () => Promise<ScanResponse>,
): Promise<Response> {
  const key = cacheKey(domain);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, hit);

  const body = await produce();
  if (!isComplete(body)) return Response.json(body);
  const response = Response.json(body, { headers: { "cache-control": `public, max-age=${SCAN_CACHE_TTL_SECONDS}` } });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

/** A Scan every Check answered, or a Domain that doesn't exist. */
function isComplete(body: ScanResponse): boolean {
  return "exists" in body || body.checks.every((check) => check.result !== "inconclusive");
}

function cacheKey(domain: string): string {
  // A synthetic GET URL; bump the version when the Scan body's shape changes.
  return `https://scan-cache.mailguard.internal/v1/${encodeURIComponent(domain)}`;
}
