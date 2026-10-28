import type { Check, CheckKind } from "@mailguard/shared";
import type { Resolver } from "../resolver";

/** What every Check receives from the Scan orchestrator. */
export interface CheckContext {
  domain: string;
  resolver: Resolver;
}

/**
 * One Check the Scan runs. To add a Check: implement this in its own file and
 * add it to the list in `./index.ts`.
 */
export interface CheckModule<K extends CheckKind = CheckKind> {
  kind: K;
  run(context: CheckContext): Promise<Extract<Check, { kind: K }>>;
  /** The Check as reported when it could not determine an answer (e.g. it timed out). */
  inconclusive(explanation: string): Extract<Check, { kind: K }>;
}

/** Any one Check module, whatever its kind (a union, so each keeps its own kind). */
export type AnyCheckModule = { [K in CheckKind]: CheckModule<K> }[CheckKind];
