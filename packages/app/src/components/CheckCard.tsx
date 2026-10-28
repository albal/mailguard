import type { Check, CheckKind } from "@mailguard/shared";
import { useId, type ComponentType } from "react";
import { checkViews } from "../checks";
import { CheckResultBadge } from "./CheckResultBadge";

export function CheckCard({ check }: { check: Check }) {
  const titleId = useId();
  const view = checkViews[check.kind as CheckKind];
  const Details = view.Details as ComponentType<{ check: Check }>;
  return (
    <article
      aria-labelledby={titleId}
      className="space-y-3 border-2 border-ink p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 id={titleId} className="text-lg font-black">
          {view.title}
        </h3>
        <CheckResultBadge result={check.result} />
      </header>
      <p>{check.explanation}</p>
      <Details check={check} />
    </article>
  );
}
