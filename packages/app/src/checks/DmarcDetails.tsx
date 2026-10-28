import type { DmarcCheck } from "@mailguard/shared";

export function DmarcDetails({ check }: { check: DmarcCheck }) {
  if (check.policyDomain === null) {
    return <p className="font-mono text-sm text-gray-500">No DMARC record found.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-gray-500">
        Policy found at <span className="font-mono">_dmarc.{check.policyDomain}</span>
        {check.inherited && " (inherited from the Organizational Domain)"}
      </p>
      {check.record !== null && <p className="break-all font-mono text-sm">{check.record}</p>}
    </div>
  );
}
