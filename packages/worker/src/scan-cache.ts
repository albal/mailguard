/** How long a Scan response is served from the edge cache. */
export const SCAN_CACHE_TTL_SECONDS = 300;

/**
 * Serves the Scan response for `domain` from the Workers Cache API, or builds
 * it with `produce` and stores it for 5 minutes. `domain` must already be
 * normalised (`normaliseDomain`) so equivalent spellings share an entry.
 * Only 200 responses are stored, without CORS headers (those depend on the
 * caller's Origin).
 *
 * The Cache API is a no-op on workers.dev: the Worker must sit on a custom
 * domain for hits to happen. Nothing depends on a hit for correctness.
 */
export async function cachedScanResponse(
  cache: Cache,
  domain: string,
  ctx: ExecutionContext,
  produce: () => Promise<Response>,
): Promise<Response> {
  const key = cacheKey(domain);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, hit);

  const response = await produce();
  if (response.status !== 200) return response;
  const cacheable = new Response(response.body, response);
  cacheable.headers.set("cache-control", `public, max-age=${SCAN_CACHE_TTL_SECONDS}`);
  ctx.waitUntil(cache.put(key, cacheable.clone()));
  return cacheable;
}

function cacheKey(domain: string): string {
  // A synthetic GET URL; bump the version when the Scan body's shape changes.
  return `https://scan-cache.mailguard.internal/v1/${encodeURIComponent(domain)}`;
}
