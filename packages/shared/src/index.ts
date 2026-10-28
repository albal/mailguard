// Scan API contract shared by the Worker and the App. Types only: nothing
// runtime crosses this boundary. Vocabulary follows GLOSSARY.md.

/** The outcome of a Check. */
export type CheckResult = "pass" | "warning" | "fail" | "inconclusive";

/** The single overall rating of a Scan, taken from its worst Check Result. */
export type Verdict = "high-risk" | "at-risk" | "incomplete" | "well-configured";

/** Fields every Check in a Scan carries. */
export interface CheckBase<Kind extends string> {
  kind: Kind;
  result: CheckResult;
  /** Plain-English explanation of what the Check means and why it got this result. */
  explanation: string;
}

/** One MX host of the Domain, with the addresses it resolved to. */
export interface MxHost {
  preference: number;
  exchange: string;
  addresses: string[];
}

export interface MxCheck extends CheckBase<"mx"> {
  /** True when the Domain publishes a Null MX (`MX 0 .`, RFC 7505). */
  nullMx: boolean;
  /** MX hosts, ordered by preference. Empty for a Null MX or when there is no MX. */
  hosts: MxHost[];
  /** A/AAAA addresses of the Domain itself, used as an implicit MX when there is no MX. */
  implicitMxAddresses: string[];
}

/** The qualifier on an SPF record's `all` mechanism. */
export type SpfAllQualifier = "+" | "-" | "~" | "?";

export interface SpfCheck extends CheckBase<"spf"> {
  /** Every SPF record (`v=spf1 …`) published at the Domain: normally exactly one. */
  records: string[];
  /** DNS lookups the record needs, counting nested `include:`/`redirect=`; null if not counted. */
  lookupCount: number | null;
  /** Qualifier of the effective `all` (following `redirect=`), or null when there is none. */
  allQualifier: SpfAllQualifier | null;
  /** Sending IPs: the single-address `ip4:`/`ip6:` entries of the Domain's own record. */
  sendingIps: string[];
}

/** What was looked up on a Blocklist: an IP, by its role(s) for the Domain, or the Domain itself. */
export type BlocklistTargetRole = "sending" | "receiving" | "domain";

/**
 * The outcome of looking one target up on one Blocklist. `not-applicable`
 * (e.g. an IPv6 address on an IPv4-only Blocklist) was not run and is left out
 * of the Verdict.
 */
export type BlocklistOutcome = "listed" | "not-listed" | "inconclusive" | "not-applicable";

export interface BlocklistLookup {
  /** The Blocklist's display name, e.g. `SpamCop`. */
  blocklist: string;
  /** The IP address, or the Domain for a domain-name Blocklist. */
  target: string;
  /** Every role the target plays: an IP can be both a Sending and a Receiving IP. */
  roles: BlocklistTargetRole[];
  outcome: BlocklistOutcome;
}

export interface BlocklistCheck extends CheckBase<"blocklists"> {
  /** Names of the Blocklists consulted (at least one applicable lookup), in configuration order. */
  blocklists: string[];
  /** One entry per target and Blocklist, grouped by target. */
  lookups: BlocklistLookup[];
}

/**
 * One entry per Check in a Scan. Each Check adds its own member to this
 * union (e.g. `| SpfCheck`), discriminated by `kind`.
 */
export type Check = MxCheck
  | SpfCheck
  | BlocklistCheck;

export type CheckKind = Check["kind"];

/** A completed Scan of a Domain: the 200 body of `GET /api/scan`. */
export interface Scan {
  domain: string;
  /** ISO-8601 time the Scan was performed (may predate the response if cached). */
  scannedAt: string;
  verdict: Verdict;
  checks: Check[];
}

/** Error body for non-200 responses. */
export interface ScanError {
  error: string;
}

/**
 * The 200 body of `GET /api/scan` when the Domain doesn't exist (NXDOMAIN).
 * No Checks run and there is no Verdict.
 */
export interface NonexistentDomain {
  domain: string;
  /** ISO-8601 time the existence check was performed. */
  scannedAt: string;
  exists: false;
}

/** Every 200 body of `GET /api/scan`. Tell them apart with `"exists" in body`. */
export type ScanResponse = Scan | NonexistentDomain;
