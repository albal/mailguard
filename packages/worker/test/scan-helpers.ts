import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import type { Check, CheckKind, Scan } from "@mailguard/shared";
import { createHandler, type Deps } from "../src/index";
import { fakeResolver, type DnsScript } from "./fake-resolver";

export const SCAN_TIME = Date.UTC(2026, 9, 28, 12, 0, 0);

/** Sends a real Request through the Worker's fetch handler with a scripted Resolver. */
export async function scanRequest(
  url: string,
  script: DnsScript = {},
  deps: Partial<Deps> = {},
): Promise<Response> {
  const handler = createHandler({
    resolver: fakeResolver(script),
    now: () => SCAN_TIME,
    ...deps,
  });
  const ctx = createExecutionContext();
  const response = await handler.fetch!(
    new Request(url) as Request<unknown, IncomingRequestCfProperties>,
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

/** Scans `domain` and returns the parsed Scan, asserting a 200. */
export async function scan(domain: string, script: DnsScript, deps: Partial<Deps> = {}): Promise<Scan> {
  const response = await scanRequest(
    `https://api.mailguard.test/api/scan?domain=${encodeURIComponent(domain)}`,
    script,
    deps,
  );
  if (response.status !== 200) throw new Error(`expected 200, got ${response.status}: ${await response.text()}`);
  return response.json<Scan>();
}

export function checkOf<K extends CheckKind>(scan: Scan, kind: K): Extract<Check, { kind: K }> {
  const check = scan.checks.find((c) => c.kind === kind);
  if (!check) throw new Error(`Scan has no ${kind} Check`);
  return check as Extract<Check, { kind: K }>;
}
