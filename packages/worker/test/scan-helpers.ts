import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import type { Check, CheckKind, Scan } from "@mailguard/shared";
import { createHandler, type Deps } from "../src/index";
import { fakeResolver, type DnsScript } from "./fake-resolver";

export const SCAN_TIME = Date.UTC(2026, 9, 28, 12, 0, 0);

/**
 * The Spamhaus DQS key every test Scan runs with unless its `env` override
 * says otherwise (e.g. `{ SPAMHAUS_DQS_KEY: undefined }`). Not a real key.
 */
export const TEST_DQS_KEY = "testdqskey0000000000000000";

/**
 * A cache that never hits, so tests scanning the same Domain don't see each
 * other's results. Edge-cache tests pass `cache: caches.default` instead.
 */
export const noCache = {
  match: async () => undefined,
  put: async () => {},
  delete: async () => false,
} as unknown as Cache;

/** A rate limiter that never limits, so tests aren't capped at 10 Scans a minute. */
export const noLimit: RateLimit = { limit: async () => ({ success: true }) };

/**
 * Sends a real Request through the Worker's fetch handler with a scripted
 * Resolver, no caching and no rate limit unless `deps` says otherwise.
 */
export async function scanRequest(
  url: string,
  script: DnsScript = {},
  deps: Partial<Deps> = {},
  { headers, env: envOverrides }: { headers?: HeadersInit; env?: Partial<Env> } = {},
): Promise<Response> {
  const handler = createHandler({
    resolver: fakeResolver(script),
    now: () => SCAN_TIME,
    cache: noCache,
    limiter: noLimit,
    ...deps,
  });
  const ctx = createExecutionContext();
  const response = await handler.fetch!(
    new Request(url, { headers }) as Request<unknown, IncomingRequestCfProperties>,
    { ...env, SPAMHAUS_DQS_KEY: TEST_DQS_KEY, ...envOverrides } as Env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

/** Scans `domain` and returns the parsed Scan, asserting a 200. */
export async function scan(
  domain: string,
  script: DnsScript,
  deps: Partial<Deps> = {},
  options: { env?: Partial<Env> } = {},
): Promise<Scan> {
  const response = await scanRequest(
    `https://api.mailguard.test/api/scan?domain=${encodeURIComponent(domain)}`,
    script,
    deps,
    options,
  );
  if (response.status !== 200) throw new Error(`expected 200, got ${response.status}: ${await response.text()}`);
  return response.json<Scan>();
}

export function checkOf<K extends CheckKind>(scan: Scan, kind: K): Extract<Check, { kind: K }> {
  const check = scan.checks.find((c) => c.kind === kind);
  if (!check) throw new Error(`Scan has no ${kind} Check`);
  return check as Extract<Check, { kind: K }>;
}
