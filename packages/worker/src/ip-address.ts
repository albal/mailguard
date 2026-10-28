// IP address text: validating IPv4/IPv6 literals and expanding IPv6 for
// reverse lookups. Shared by SPF parsing and the Blocklist query names.

/** Whether `text` is a dotted-quad IPv4 address, e.g. `192.0.2.1`. */
export function isIpv4(text: string): boolean {
  const parts = text.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** Whether `text` is an IPv6 address (RFC 4291 §2.2), including `::` and an embedded IPv4 tail. */
export function isIpv6(text: string): boolean {
  let hex = text;
  if (text.includes(".")) {
    // An embedded IPv4 tail (e.g. `::ffff:192.0.2.1`) stands for two groups.
    const lastColon = text.lastIndexOf(":");
    if (!isIpv4(text.slice(lastColon + 1))) return false;
    hex = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = hex.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half === "" ? [] : half.split(":")));
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return halves.length === 2 ? groups.length < 8 : groups.length === 8;
}

/**
 * A valid IPv6 address as its 32 lower-case hex nibbles, e.g. `2001:db8::1` →
 * `20010db8000…0001`.
 */
export function ipv6Nibbles(address: string): string {
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
