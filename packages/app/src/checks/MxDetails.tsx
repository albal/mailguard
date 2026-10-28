import type { MxCheck } from "@mailguard/shared";

export function MxDetails({ check }: { check: MxCheck }) {
  if (check.nullMx) return <p className="font-mono text-sm">MX 0 .</p>;

  if (check.hosts.length > 0) {
    return (
      <ul className="space-y-1 font-mono text-sm">
        {check.hosts.map((host) => (
          <li key={host.exchange}>
            <span className="text-gray-500">{host.preference}</span> <span>{host.exchange}</span>
            {host.addresses.length > 0 && <span className="text-gray-500"> → {host.addresses.join(", ")}</span>}
          </li>
        ))}
      </ul>
    );
  }

  if (check.implicitMxAddresses.length > 0) {
    return <p className="font-mono text-sm">Implicit MX: {check.implicitMxAddresses.join(", ")}</p>;
  }

  return null;
}
