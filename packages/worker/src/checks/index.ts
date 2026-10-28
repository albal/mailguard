import type { CheckModule } from "./check-module";
import { mxCheck } from "./mx";
import { spfCheck } from "./spf";
import { dmarcCheck } from "./dmarc";
import { blocklistCheck } from "./blocklists";

/** Every Check a Scan runs, concurrently, in this order in the response. */
export const checks: CheckModule[] = [
  mxCheck,
  spfCheck,
  dmarcCheck,
  blocklistCheck,
];
