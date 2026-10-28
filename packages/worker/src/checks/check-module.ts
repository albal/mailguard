import type { Check, CheckKind, CheckResult } from "@mailguard/shared";
import type { Resolver } from "../resolver";

/** What every Check receives from the Scan orchestrator. */
export interface CheckContext {
  domain: string;
  resolver: Resolver;
  /** Spamhaus DQS key (Worker secret); without one, DQS Blocklist lookups are Inconclusive. */
  dqsKey?: string;
}

/** The Check of kind `K` as it appears in a Scan. */
export type CheckOf<K extends CheckKind> = Extract<Check, { kind: K }>;

/** A Check's own fields, beyond those every Check carries. */
export type CheckDetails<K extends CheckKind> = Omit<CheckOf<K>, "kind" | "result" | "explanation">;

/** Builds a Check of one kind: its result and explanation, plus whichever details it found. */
export type Report<K extends CheckKind> = (
  result: CheckResult,
  explanation: string,
  details?: Partial<CheckDetails<K>>,
) => CheckOf<K>;

/** The `Report` for `kind`, filling any detail not given from `emptyDetails`. */
export function reporter<K extends CheckKind>(kind: K, emptyDetails: CheckDetails<K>): Report<K> {
  return (result, explanation, details = {}) =>
    ({ kind, result, explanation, ...emptyDetails, ...details }) as CheckOf<K>;
}

/**
 * One Check the Scan runs. To add a Check: implement this in its own file and
 * add it to the list in `./index.ts`. `CheckModule` with no argument is the
 * union of every kind's module.
 */
export type CheckModule<K extends CheckKind = CheckKind> = K extends CheckKind
  ? {
      kind: K;
      run(context: CheckContext): Promise<CheckOf<K>>;
      /** Builds this Check's result, e.g. Inconclusive when it timed out. */
      report: Report<K>;
    }
  : never;
