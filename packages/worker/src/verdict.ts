import type { Check, Verdict } from "@mailguard/shared";

/** The Verdict is the worst Check Result across the Scan (PRD §2.3). */
export function verdictOf(checks: Pick<Check, "result">[]): Verdict {
  const results = new Set(checks.map((c) => c.result));
  if (results.has("fail")) return "high-risk";
  if (results.has("warning")) return "at-risk";
  if (results.has("inconclusive")) return "incomplete";
  return "well-configured";
}
