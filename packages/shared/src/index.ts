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

/** A DMARC policy value (`p=` / `sp=`). */
export type DmarcPolicy = "none" | "quarantine" | "reject";

export interface DmarcCheck extends CheckBase<"dmarc"> {
  /** The domain whose `_dmarc` record supplied the policy: the Domain or its Organizational Domain. Null when none was found. */
  policyDomain: string | null;
  /** True when the policy was inherited from the Organizational Domain. */
  inherited: boolean;
  /** The DMARC record as published, or null when none was found. */
  record: string | null;
  /** The policy that applies to the Domain (`sp=` over `p=` when inherited). Null when there is no valid record. */
  policy: DmarcPolicy | null;
  /** Percentage of mail the policy applies to (`pct=`, default 100). Null when there is no valid record. */
  pct: number | null;
}

/**
 * One entry per Check in a Scan. Each Check adds its own member to this
 * union (e.g. `| SpfCheck`), discriminated by `kind`.
 */
export type Check =
  | MxCheck
  | DmarcCheck;

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
