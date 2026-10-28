import { SPF_LOOKUP_LIMIT, type SpfCheck } from "@mailguard/shared";

export function SpfDetails({ check }: { check: SpfCheck }) {
  if (check.records.length === 0) return null;
  return (
    <div className="space-y-1">
      <ul className="space-y-1 font-mono text-sm break-all">
        {check.records.map((record) => (
          <li key={record}>{record}</li>
        ))}
      </ul>
      {check.lookupCount !== null && (
        <p className="text-sm text-muted">
          Uses {check.lookupCount} of {SPF_LOOKUP_LIMIT} DNS lookups
        </p>
      )}
    </div>
  );
}
