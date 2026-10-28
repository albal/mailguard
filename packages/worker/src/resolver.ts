// The Resolver is the only way any module reaches DNS, and the seam tests
// replace with a scripted fake.

export type RecordType = "A" | "AAAA" | "MX" | "TXT";

/**
 * The four outcomes of a DNS query.
 *
 * `answers` carries the records of the requested type (empty for NODATA), in
 * normalised presentation form:
 * - A / AAAA: the address, e.g. `192.0.2.1`
 * - MX: `<preference> <exchange>` with the exchange's trailing dot removed,
 *   except the root: a Null MX is `0 .`
 * - TXT: the record's character-strings unquoted and joined with no separator
 */
export type ResolveOutcome =
  | { kind: "answers"; answers: string[] }
  | { kind: "nxdomain" }
  | { kind: "error" }
  | { kind: "timeout" };

export interface Resolver {
  resolve(name: string, type: RecordType): Promise<ResolveOutcome>;
}
