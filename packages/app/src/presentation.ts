import type { CheckResult, Verdict } from "@mailguard/shared";

// The one mapping from each Check Result to its icon, label and style (PRD §4.1).
// Results are told apart by icon and label, never by colour alone.
export const checkResultPresentation: Record<CheckResult, { icon: string; label: string; className: string }> = {
  pass: {
    icon: "✓",
    label: "Pass",
    className: "border-2 border-black text-black dark:border-white dark:text-white",
  },
  warning: {
    icon: "!",
    label: "Warning",
    className: "border-2 border-red-600 text-red-600",
  },
  fail: {
    icon: "✕",
    label: "Fail",
    className: "border-2 border-red-600 bg-red-600 text-white",
  },
  inconclusive: {
    icon: "?",
    label: "Inconclusive",
    className: "border-2 border-gray-400 text-gray-500 dark:text-gray-400",
  },
};

export const verdictLabels: Record<Verdict, string> = {
  "high-risk": "High Risk",
  "at-risk": "At Risk",
  incomplete: "Incomplete",
  "well-configured": "Well Configured",
};
