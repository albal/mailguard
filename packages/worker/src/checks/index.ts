import type { AnyCheckModule } from "./check-module";
import { mxCheck } from "./mx";
import { dmarcCheck } from "./dmarc";

/** Every Check a Scan runs, concurrently, in this order in the response. */
export const checks: AnyCheckModule[] = [
  mxCheck,
  dmarcCheck,
];
