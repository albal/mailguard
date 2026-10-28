import type { Scan } from "@mailguard/shared";
import { checkViews, type CheckGroup } from "../checks";
import { verdictLabels } from "../presentation";
import { CheckCard } from "./CheckCard";

const groups: { group: CheckGroup; title: string }[] = [
  { group: "security-protocols", title: "Security Protocols" },
  { group: "reputation", title: "Reputation" },
];

export function ScanResults({ scan }: { scan: Scan }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="verdict-heading" className="border-4 border-ink p-6">
        <h2 id="verdict-heading" className="text-sm font-bold uppercase tracking-wide text-muted">
          Verdict for {scan.domain}
        </h2>
        <p
          className={`text-4xl font-black ${scan.verdict === "high-risk" || scan.verdict === "at-risk" ? "text-accent-text" : ""}`}
        >
          {verdictLabels[scan.verdict]}
        </p>
        <p className="text-sm text-muted">
          Scanned <time dateTime={scan.scannedAt}>{new Date(scan.scannedAt).toLocaleString()}</time>
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {groups.map(({ group, title }) => {
          const checks = scan.checks.filter((check) => checkViews[check.kind].group === group);
          if (checks.length === 0) return null;
          return (
            <section key={group} aria-label={title} className="space-y-4">
              <h2 className="text-xl font-black">{title}</h2>
              {checks.map((check) => (
                <CheckCard key={check.kind} check={check} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
