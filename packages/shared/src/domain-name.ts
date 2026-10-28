// The one rule for what counts as a valid Domain, run by the App before it
// sends anything and again by the Worker on what it receives. Imported as
// `@mailguard/shared/domain-name` so the package root stays types-only.

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Normalises an ASCII (Punycode) Domain: lower-cases it and drops one
 * trailing dot. Returns `null` unless the result is a valid hostname of at
 * least two labels, at most 253 characters, whose top-level label is not
 * all digits (so IP addresses are rejected). A label with `--` in positions
 * 3–4 must be an IDNA `xn--` label.
 */
export function normaliseDomain(input: string): string | null {
  const domain = input.toLowerCase().replace(/\.$/, "");
  if (domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => LABEL.test(label) && (label.slice(2, 4) !== "--" || label.startsWith("xn--")))) {
    return null;
  }
  if (/^\d+$/.test(labels[labels.length - 1]!)) return null;
  return domain;
}
