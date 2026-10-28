import type { MxHost } from "@mailguard/shared";
import { isUndetermined, type Resolver } from "./resolver";

// Where a Domain receives mail (RFC 5321 §5.1, RFC 7505 Null MX): its MX hosts
// and their addresses, looked up through the Resolver. Shared by the MX Check
// and the Blocklist Check (Receiving IPs).

/** Addresses found for some name(s), and whether a failed lookup may have hidden others. */
export interface AddressLookup {
  addresses: string[];
  undetermined: boolean;
}

/** What `lookupMx` found for a domain. */
export type MxLookup =
  /** The MX lookup errored or timed out. */
  | { kind: "undetermined" }
  /** A Null MX (`MX 0 .`). */
  | { kind: "null" }
  /** MX hosts ordered by preference; `undetermined` if any address lookup failed. */
  | { kind: "hosts"; hosts: MxHost[]; undetermined: boolean }
  /** No MX record: the domain's own A/AAAA addresses act as an implicit MX. */
  | ({ kind: "implicit" } & AddressLookup);

export async function lookupMx(resolver: Resolver, domain: string): Promise<MxLookup> {
  const mx = await resolver.resolve(domain, "MX");
  if (isUndetermined(mx)) return { kind: "undetermined" };
  const records = mx.kind === "answers" ? mx.answers.map(parseMx) : [];

  if (records.length === 1 && records[0].exchange === ".") return { kind: "null" };
  if (records.length === 0) return { kind: "implicit", ...(await lookupAddresses(resolver, domain)) };

  const lookups = await Promise.all(records.map((r) => lookupAddresses(resolver, r.exchange)));
  const hosts: MxHost[] = records
    .map((r, i) => ({ preference: r.preference, exchange: r.exchange, addresses: lookups[i].addresses }))
    .sort((x, y) => x.preference - y.preference);
  return { kind: "hosts", hosts, undetermined: lookups.some((l) => l.undetermined) };
}

/**
 * Receiving IPs: the A/AAAA addresses of the MX hosts, and whether any lookup
 * failed so the list may be incomplete. A Null MX or no MX at all means none:
 * an implicit MX's addresses are not Receiving IPs (GLOSSARY).
 */
export function receivingIpsOf(lookup: MxLookup): AddressLookup {
  switch (lookup.kind) {
    case "undetermined":
      return { addresses: [], undetermined: true };
    case "null":
    case "implicit":
      return { addresses: [], undetermined: false };
    case "hosts":
      return { addresses: lookup.hosts.flatMap((h) => h.addresses), undetermined: lookup.undetermined };
  }
}

/** A and AAAA addresses of `name`, and whether any lookup failed to give an answer. */
async function lookupAddresses(resolver: Resolver, name: string): Promise<AddressLookup> {
  const outcomes = await Promise.all([resolver.resolve(name, "A"), resolver.resolve(name, "AAAA")]);
  return {
    addresses: outcomes.flatMap((o) => (o.kind === "answers" ? o.answers : [])),
    undetermined: outcomes.some(isUndetermined),
  };
}

function parseMx(answer: string): { preference: number; exchange: string } {
  const [preference, exchange = ""] = answer.trim().split(/\s+/);
  return { preference: Number(preference), exchange: exchange.toLowerCase() };
}
