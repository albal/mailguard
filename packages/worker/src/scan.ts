import type { Check, Scan } from "@mailguard/shared";
import { checks } from "./checks";
import type { AnyCheckModule, CheckContext } from "./checks/check-module";
import type { Resolver } from "./resolver";
import { verdictOf } from "./verdict";

export interface ScanDeps {
  resolver: Resolver;
  now: () => number;
  /** How long each Check may run before it is reported as Inconclusive. */
  checkTimeoutMs: number;
}

/** Runs every Check concurrently, each under its own timeout, and works out the Verdict. */
export async function runScan(domain: string, deps: ScanDeps): Promise<Scan> {
  const scannedAt = new Date(deps.now()).toISOString();
  const context: CheckContext = { domain, resolver: deps.resolver };
  const results = await Promise.all(checks.map((check) => runWithTimeout(check, context, deps.checkTimeoutMs)));
  return { domain, scannedAt, verdict: verdictOf(results), checks: results };
}

async function runWithTimeout(check: AnyCheckModule, context: CheckContext, timeoutMs: number): Promise<Check> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<Check>((resolve) => {
    timer = setTimeout(
      () => resolve(check.inconclusive("This check timed out before DNS answered, so MailGuard couldn't determine a result.")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([
      check.run(context).catch(() =>
        check.inconclusive("This check hit an unexpected error, so MailGuard couldn't determine a result."),
      ),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
