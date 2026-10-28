import type { BlocklistCheck, BlocklistLookup } from "@mailguard/shared";

/** What the subject is to the Domain, e.g. "sending and receiving server" or "the domain". */
function roleOf(lookup: BlocklistLookup): string {
  if (lookup.roles.includes("domain")) return "the domain";
  return `${lookup.roles.join(" and ")} server`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function BlocklistDetails({ check }: { check: BlocklistCheck }) {
  const listed = check.lookups.filter((l) => l.outcome === "listed");
  const withoutKey = check.blocklistsWithoutKey;
  // Lookups on a Blocklist without its key are explained once, below, not one by one.
  const unchecked = check.lookups.filter((l) => l.outcome === "inconclusive" && !withoutKey.includes(l.blocklist));
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Checked against {plural(check.blocklists.length, "Blocklist")}, {plural(listed.length, "listing")}
      </p>
      {listed.length > 0 && (
        <ul aria-label="Listings" className="space-y-1 text-sm">
          {listed.map((l) => (
            <li key={`${l.blocklist} ${l.subject}`} className="border-l-4 border-accent-text pl-2 text-ink">
              <span className="font-bold">{l.blocklist}</span> lists <span className="font-mono break-all">{l.subject}</span>{" "}
              ({roleOf(l)})
            </li>
          ))}
        </ul>
      )}
      {withoutKey.length > 0 && (
        <p className="text-sm text-muted">
          {withoutKey.join(" and ")} {withoutKey.length === 1 ? "wasn't" : "weren't"} checked: this MailGuard server has no
          Spamhaus DQS key.
        </p>
      )}
      {unchecked.length > 0 && (
        <ul aria-label="Lookups that couldn't be completed" className="space-y-1 text-sm text-muted">
          {unchecked.map((l) => (
            <li key={`${l.blocklist} ${l.subject}`}>
              Couldn't check <span className="font-mono break-all">{l.subject}</span> ({roleOf(l)}) on {l.blocklist}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
