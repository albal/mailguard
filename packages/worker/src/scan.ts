import type { Check, ScanResponse } from "@mailguard/shared";
import { checks } from "./checks";
import type { CheckContext, CheckModule } from "./checks/check-module";
import type { ResolveOutcome, Resolver } from "./resolver";
import { verdictOf } from "./verdict";

export interface ScanDeps {
  resolver: Resolver;
  now: () => number;
  /**
   * How long each Check may run before it is reported as Inconclusive. Time
   * spent on the NXDOMAIN pre-check comes out of this budget.
   */
  checkTimeoutMs: number;
  /** Spamhaus DQS key, from the `SPAMHAUS_DQS_KEY` Worker secret. */
  dqsKey?: string;
}

/** Longest the NXDOMAIN pre-check may hold up the Checks. */
const EXISTENCE_TIMEOUT_MS = 500;

/**
 * After a Check's deadline, how long it has to hand back partial results
 * before the orchestrator reports it as Inconclusive.
 */
const PARTIAL_RESULTS_GRACE_MS = 10;

/**
 * Checks the Domain exists, then runs every Check concurrently, each under its
 * own timeout, and works out the Verdict. A Domain that doesn't exist gets no
 * Checks and no Verdict.
 */
export async function runScan(domain: string, deps: ScanDeps): Promise<ScanResponse> {
  const scannedAt = new Date(deps.now()).toISOString();
  const started = Date.now();
  if ((await existenceOf(domain, deps)).kind === "nxdomain") return { domain, scannedAt, exists: false };

  const remainingMs = Math.max(0, deps.checkTimeoutMs - (Date.now() - started));
  const context = { domain, resolver: deps.resolver, dqsKey: deps.dqsKey };
  const results = await Promise.all(checks.map((check) => runWithTimeout(check, context, remainingMs)));
  return { domain, scannedAt, verdict: verdictOf(results), checks: results };
}

/**
 * Asks DNS whether the Domain exists. Only a definite NXDOMAIN stops the Scan;
 * an error or timeout lets the Checks run and report for themselves.
 */
function existenceOf(domain: string, deps: ScanDeps): Promise<ResolveOutcome> {
  return withTimeout(
    deps.resolver.resolve(domain, "A").catch((): ResolveOutcome => ({ kind: "error" })),
    Math.min(EXISTENCE_TIMEOUT_MS, deps.checkTimeoutMs),
    (): ResolveOutcome => ({ kind: "timeout" }),
  );
}

/**
 * Runs `check`, whose deadline comes after `timeoutMs`. A Check that hasn't
 * returned shortly after that is Inconclusive.
 */
async function runWithTimeout(
  check: CheckModule,
  context: Omit<CheckContext, "deadline">,
  timeoutMs: number,
): Promise<Check> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    return await withTimeout(
      check
        .run({ ...context, deadline })
        .catch(() => check.report("inconclusive", "This check hit an unexpected error, so MailGuard couldn't determine a result.")),
      timeoutMs + PARTIAL_RESULTS_GRACE_MS,
      () => check.report("inconclusive", "This check timed out before DNS answered, so MailGuard couldn't determine a result."),
    );
  } finally {
    clearTimeout(timer);
  }
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), timeoutMs);
  });
  try {
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
