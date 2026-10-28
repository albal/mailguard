import type { CheckResult, Verdict } from "@mailguard/shared";

// The one mapping from each Check Result to its icon, label and style (PRD §4.1).
// Results are told apart by icon and label, never by colour alone.
export const checkResultPresentation: Record<CheckResult, { icon: string; label: string; className: string }> = {
  pass: {
    icon: "✓",
    label: "Pass",
    className: "border-2 border-ink text-ink",
  },
  warning: {
    icon: "!",
    label: "Warning",
    className: "border-2 border-accent-text text-accent-text",
  },
  fail: {
    icon: "✕",
    label: "Fail",
    className: "border-2 border-accent bg-accent text-white",
  },
  inconclusive: {
    icon: "?",
    label: "Inconclusive",
    className: "border-2 border-dashed border-muted text-muted",
  },
};

// Each Verdict's label and style: red for the two that need action.
export const verdictPresentation: Record<Verdict, { label: string; className: string }> = {
  "high-risk": { label: "High Risk", className: "text-accent-text" },
  "at-risk": { label: "At Risk", className: "text-accent-text" },
  incomplete: { label: "Incomplete", className: "" },
  "well-configured": { label: "Well Configured", className: "" },
};
