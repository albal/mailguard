// Worker bindings and vars declared in wrangler.jsonc. Add a field here when
// you add a binding (rate limiter, ALLOWED_ORIGINS, DQS key, ...).
declare global {
  interface Env {
    /** Workers Rate Limiting binding: 10 Scans per minute per client IP. */
    SCAN_LIMITER: RateLimit;
    /**
     * Comma-separated origins allowed to call the Scan API. An entry may use a
     * leading `*.` wildcard for one or more subdomain labels, e.g.
     * `https://*.mailguard.pages.dev`.
     */
    ALLOWED_ORIGINS: string;
  }
}

export {};
