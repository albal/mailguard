import type { Check, CheckKind } from "@mailguard/shared";
import type { Resolver } from "../resolver";

/** What every Check receives from the Scan orchestrator. */
export interface CheckContext {
  domain: string;
  resolver: Resolver;
  /** Spamhaus DQS key (Worker secret); Blocklists queried through DQS are skipped without one. */
  dqsKey?: string;
}

/**
 * One Check the Scan runs. To add a Check: implement this in its own file and
 * add it to the list in `./index.ts`. `CheckModule` with no argument is the
 * union of every kind's module.
 */
export type CheckModule<K extends CheckKind = CheckKind> = K extends CheckKind
  ? {
      kind: K;
      run(context: CheckContext): Promise<Extract<Check, { kind: K }>>;
      /** The Check as reported when it could not determine an answer (e.g. it timed out). */
      inconclusive(explanation: string): Extract<Check, { kind: K }>;
    }
  : never;
