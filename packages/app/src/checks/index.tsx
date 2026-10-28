import type { Check, CheckKind } from "@mailguard/shared";
import type { ComponentType } from "react";
import { MxDetails } from "./MxDetails";
import { SpfDetails } from "./SpfDetails";
import { BlocklistDetails } from "./BlocklistDetails";

export type CheckGroup = "security-protocols" | "reputation";

interface CheckView<K extends CheckKind> {
  title: string;
  group: CheckGroup;
  /** Renders the Check's parsed records and details. */
  Details: ComponentType<{ check: Extract<Check, { kind: K }> }>;
}

/**
 * How each Check is shown. To add a Check: add its details component in this
 * folder and an entry here (the type requires one per Check kind).
 */
export const checkViews: { [K in CheckKind]: CheckView<K> } = {
  mx: { title: "MX", group: "security-protocols", Details: MxDetails },
  spf: { title: "SPF", group: "security-protocols", Details: SpfDetails },
  blocklists: { title: "Blocklists", group: "reputation", Details: BlocklistDetails },
};
