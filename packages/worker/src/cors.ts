/**
 * Adds CORS headers to `response` when the request's Origin is in
 * `allowedOrigins` (the comma-separated `ALLOWED_ORIGINS` var). Other origins
 * get no allow header. An entry like `https://*.mailguard.pages.dev` matches
 * any subdomain of `mailguard.pages.dev` over the same scheme.
 */
export function withCors(request: Request, response: Response, allowedOrigins: string): Response {
  const origin = request.headers.get("origin");
  const headers = new Headers(response.headers);
  headers.append("vary", "Origin");
  if (origin && isAllowed(origin, allowedOrigins)) {
    headers.set("access-control-allow-origin", origin);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isAllowed(origin: string, allowedOrigins: string): boolean {
  return allowedOrigins
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((pattern) => matches(origin, pattern));
}

function matches(origin: string, pattern: string): boolean {
  const wildcard = pattern.match(/^([a-z][a-z0-9+.-]*:\/\/)\*\.(.+)$/i);
  if (!wildcard) return origin === pattern;
  const [, scheme, suffix] = wildcard;
  if (!origin.startsWith(scheme!)) return false;
  const host = origin.slice(scheme!.length);
  return host.endsWith(`.${suffix}`) && host.length > suffix!.length + 1;
}
