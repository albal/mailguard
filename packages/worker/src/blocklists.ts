// The single Blocklist configuration (PRD §2.2 Blocklists, ADR-0002). To add a
// Blocklist, add an entry here; the Blocklist Check consults every entry.
// Only lists that answer Cloudflare's public resolver belong here.

export interface Blocklist {
  /** Display name, shown in the Reputation column. */
  name: string;
  /**
   * DNS zone queried. For a DQS list this is the zone after the key, e.g.
   * `zen.dq.spamhaus.net` is queried as `<subject>.<key>.zen.dq.spamhaus.net`.
   */
  zone: string;
  /** Whether it lists IP addresses (Sending and Receiving IPs) or domain names (the Domain). */
  lists: "ip" | "domain";
  /** Whether IPv6 addresses can be looked up. If not, they are not applicable. */
  ipv6: boolean;
  /**
   * Queried through Spamhaus DQS with the key from the `SPAMHAUS_DQS_KEY`
   * Worker secret. Without a key every lookup on it is Inconclusive.
   */
  dqs: boolean;
  /** A-record answers that mean the subject is listed. */
  listedCodes: string[];
  /**
   * A-record answers that are neither a listing nor an error, e.g. reputation
   * scores. Any answer in neither list is a refusal or error: Inconclusive.
   */
  notListedCodes: string[];
}

export const blocklists: Blocklist[] = [
  {
    name: "SpamCop",
    zone: "bl.spamcop.net",
    lists: "ip",
    ipv6: false,
    dqs: false,
    listedCodes: ["127.0.0.2"],
    notListedCodes: [],
  },
  {
    name: "PSBL",
    zone: "psbl.surriel.com",
    lists: "ip",
    ipv6: false,
    dqs: false,
    listedCodes: ["127.0.0.2"],
    notListedCodes: [],
  },
  {
    // Only `bl.` (spam waves plus reputation L3–L5). `rep.` and `wl.` also
    // answer for good senders.
    name: "Mailspike",
    zone: "bl.mailspike.net",
    lists: "ip",
    ipv6: false,
    dqs: false,
    // .2 spam wave (Z), .10–.12 reputation L5–L3.
    listedCodes: ["127.0.0.2", "127.0.0.10", "127.0.0.11", "127.0.0.12"],
    // .13 L2 suspicious through .20 H5 excellent: reputation scores, not listings.
    notListedCodes: ["127.0.0.13", "127.0.0.14", "127.0.0.15", "127.0.0.16", "127.0.0.17", "127.0.0.18", "127.0.0.19", "127.0.0.20"],
  },
  {
    // The public `zen.spamhaus.org` refuses Cloudflare's resolver (ADR-0002).
    name: "Spamhaus ZEN",
    zone: "zen.dq.spamhaus.net",
    lists: "ip",
    ipv6: true,
    dqs: true,
    // .2 SBL, .3 SBL CSS, .4–.7 XBL, .9 DROP, .10–.11 PBL. 127.255.255.x
    // (errors) is in neither list: Inconclusive.
    listedCodes: ["127.0.0.2", "127.0.0.3", "127.0.0.4", "127.0.0.5", "127.0.0.6", "127.0.0.7", "127.0.0.9", "127.0.0.10", "127.0.0.11"],
    notListedCodes: [],
  },
  {
    // The public `dbl.spamhaus.org` refuses Cloudflare's resolver (ADR-0002).
    name: "Spamhaus DBL",
    zone: "dbl.dq.spamhaus.net",
    lists: "domain",
    ipv6: false,
    dqs: true,
    // .2 spam, .4 phish, .5 malware, .6 botnet C&C; .102–.106 the same for
    // abused legitimate domains. .255 (IP queried) and 127.255.255.x (errors)
    // are in neither list: Inconclusive.
    listedCodes: ["127.0.1.2", "127.0.1.4", "127.0.1.5", "127.0.1.6", "127.0.1.102", "127.0.1.103", "127.0.1.104", "127.0.1.105", "127.0.1.106"],
    notListedCodes: [],
  },
];

/**
 * The DNS name to query for `subject` on `blocklist` (RFC 5782 §2): an IPv4
 * address with its octets reversed, an IPv6 address as 32 reversed nibbles, or
 * a domain name as is, followed by the DQS key (if any) and the zone.
 */
export function queryNameOf(blocklist: Blocklist, subject: string, dqsKey?: string): string {
  const zone = blocklist.dqs ? `${dqsKey}.${blocklist.zone}` : blocklist.zone;
  return `${reversedSubject(blocklist, subject)}.${zone}`;
}

export function isIpv6(address: string): boolean {
  return address.includes(":");
}

function reversedSubject(blocklist: Blocklist, subject: string): string {
  if (blocklist.lists === "domain") return subject;
  if (!isIpv6(subject)) return subject.split(".").reverse().join(".");
  return expandIpv6(subject).split("").reverse().join(".");
}

/** An IPv6 address as its 32 hex nibbles, e.g. `2001:db8::1` → `20010db8000…0001`. */
function expandIpv6(address: string): string {
  let text = address.toLowerCase();
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    // An embedded IPv4 tail (e.g. `::ffff:192.0.2.1`) stands for two groups.
    const [a, b, c, d] = tail.split(".").map(Number);
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    text = `${text.slice(0, lastColon + 1)}${hex(a)}${hex(b)}:${hex(c)}${hex(d)}`;
  }
  const [head, rest] = text.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const restGroups = rest === undefined || rest === "" ? [] : rest.split(":");
  const zeros = Array<string>(8 - headGroups.length - restGroups.length).fill("0");
  const groups = rest === undefined ? headGroups : [...headGroups, ...zeros, ...restGroups];
  return groups.map((g) => g.padStart(4, "0")).join("");
}
