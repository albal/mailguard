import type { CheckModule } from "./check-module";
import { mxCheck } from "./mx";
import { spfCheck } from "./spf";

/** Every Check a Scan runs, concurrently, in this order in the response. */
export const checks: CheckModule[] = [
  mxCheck,
  spfCheck,
];
