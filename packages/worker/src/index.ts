import "./env";
import type { ScanError, ScanResponse } from "@mailguard/shared";
import { normaliseDomain } from "@mailguard/shared/domain-name";
import { createDohResolver } from "./doh-resolver";
import type { Resolver } from "./resolver";
import { runScan, type ScanDeps } from "./scan";

export interface Deps {
  resolver: Resolver;
  now: () => number;
  /** Per-Check timeout. Defaults to keep the whole Scan under 2.5 s. */
  checkTimeoutMs?: number;
}

const DEFAULT_CHECK_TIMEOUT_MS = 2000;

export function createHandler(options: Deps): ExportedHandler<Env> {
  const deps: ScanDeps = { ...options, checkTimeoutMs: options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS };
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.pathname !== "/api/scan") {
        return json<ScanError>({ error: "Not found" }, 404);
      }
      const domain = url.searchParams.get("domain");
      if (!domain) return json<ScanError>({ error: "Missing domain" }, 400);
      const normalised = normaliseDomain(domain);
      if (!normalised) return json<ScanError>({ error: "Invalid domain" }, 400);
      return json<ScanResponse>(await runScan(normalised, deps));
    },
  };
}

export default createHandler({ resolver: createDohResolver(), now: () => Date.now() });

function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}
