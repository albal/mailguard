import type { CheckResult } from "@mailguard/shared";
import { checkResultPresentation } from "../presentation";

export function CheckResultBadge({ result }: { result: CheckResult }) {
  const { icon, label, className } = checkResultPresentation[result];
  return (
    <span data-testid="check-result" className={`inline-flex items-center gap-1 px-2 py-0.5 text-sm font-bold ${className}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}
