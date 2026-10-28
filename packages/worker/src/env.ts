// Worker bindings and vars declared in wrangler.jsonc. Add a field here when
// you add a binding (rate limiter, ALLOWED_ORIGINS, DQS key, ...).
declare global {
  interface Env {}
}

export {};
