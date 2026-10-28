import type { DmarcCheck, DmarcPolicySource } from "@mailguard/shared";

const sourceNotes: Record<DmarcPolicySource, string> = {
  domain: "",
  "organizational-domain": " (inherited from the Organizational Domain)",
  "public-suffix-domain": " (inherited from the public suffix)",
};

export function DmarcDetails({ check }: { check: DmarcCheck }) {
  if (check.policyDomain === null) {
    return <p className="font-mono text-sm text-muted">No DMARC record found.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted">
        Policy found at <span className="font-mono">_dmarc.{check.policyDomain}</span>
        {check.policySource && sourceNotes[check.policySource]}
      </p>
      {check.record !== null && <p className="break-all font-mono text-sm">{check.record}</p>}
    </div>
  );
}
