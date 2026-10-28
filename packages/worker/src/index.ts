import "./env";
import type { ScanError } from "@mailguard/shared";
import { normaliseDomain } from "@mailguard/shared/domain-name";
import { createDohResolver } from "./doh-resolver";
import { runScan, type ScanDeps } from "./scan";
import { cachedScanResponse } from "./scan-cache";
import { withCors } from "./cors";

/** What the Worker is built from: the Scan's dependencies plus its edge services. */
export interface Deps extends Omit<ScanDeps, "checkTimeoutMs" | "dqsKey"> {
  /** Per-Check timeout. Defaults to keep the whole Scan under 2.5 s. */
  checkTimeoutMs?: number;
  /** Edge cache for Scan responses. Defaults to `caches.default`. */
  cache?: Cache;
  /** Per-IP rate limiter. Defaults to the `SCAN_LIMITER` binding. */
  limiter?: RateLimit;
}

const DEFAULT_CHECK_TIMEOUT_MS = 2000;

export function createHandler(options: Deps): ExportedHandler<Env> {
  const api = scanApi(options);
  return {
    async fetch(request, env, ctx) {
      return withCors(request, await api.fetch!(request, env, ctx), env.ALLOWED_ORIGINS ?? "");
    },
  };
}

/** The Scan API itself, before CORS headers are added. */
function scanApi(options: Deps): ExportedHandler<Env> {
  const deps: ScanDeps = { ...options, checkTimeoutMs: options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS };
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.pathname !== "/api/scan") {
        return json<ScanError>({ error: "Not found" }, 404);
      }
      // Limit before the cache: cached Scans count too.
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await (options.limiter ?? env.SCAN_LIMITER).limit({ key: ip });
      if (!success) {
        return json<ScanError>({ error: "Too many Scans. Please wait a minute and try again." }, 429);
      }
      const domain = url.searchParams.get("domain");
      if (!domain) return json<ScanError>({ error: "Missing domain" }, 400);
      const normalised = normaliseDomain(domain);
      if (!normalised) return json<ScanError>({ error: "Invalid domain" }, 400);
      return cachedScanResponse(options.cache ?? caches.default, normalised, ctx, () =>
        runScan(normalised, { ...deps, dqsKey: env.SPAMHAUS_DQS_KEY }),
      );
    },
  };
}

export default createHandler({ resolver: createDohResolver(), now: () => Date.now() });

function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}
