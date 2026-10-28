import { describe, expect, it } from "vitest";
import { fakeResolver, type DnsScript } from "./fake-resolver";
import { checkOf, scan, TEST_DQS_KEY } from "./scan-helpers";

const ZEN = `${TEST_DQS_KEY}.zen.dq.spamhaus.net`;
const IPV4_ONLY_ZONES = ["bl.spamcop.net", "psbl.surriel.com", "bl.mailspike.net"];
const ZONES = [...IPV4_ONLY_ZONES, ZEN];

/** NXDOMAIN on every Blocklist for an IPv4 `ip`: not listed anywhere. */
function unlisted(ip: string): DnsScript {
  const reversed = ip.split(".").reverse().join(".");
  return Object.fromEntries(ZONES.map((zone) => [`${reversed}.${zone}`, "nxdomain" as const]));
}

describe("Blocklist Check: Sending IPs", () => {
  it("fails when a Sending IP is listed, naming the Blocklist and the IP's role", async () => {
    const result = await scan("example.com", {
      "example.com": { TXT: ["v=spf1 ip4:192.0.2.1 -all"] },
      "1.2.0.192.bl.spamcop.net": { A: ["127.0.0.2"] },
      "1.2.0.192.psbl.surriel.com": "nxdomain",
      "1.2.0.192.bl.mailspike.net": "nxdomain",
      [`1.2.0.192.${ZEN}`]: "nxdomain",
    });

    const blocklists = checkOf(result, "blocklists");
    expect(blocklists.result).toBe("fail");
    expect(blocklists.blocklists).toEqual(["SpamCop", "PSBL", "Mailspike", "Spamhaus ZEN", "Spamhaus DBL"]);
    expect(blocklists.lookups.filter((l) => l.target !== "example.com")).toEqual([
      { blocklist: "SpamCop", target: "192.0.2.1", roles: ["sending"], outcome: "listed" },
      { blocklist: "PSBL", target: "192.0.2.1", roles: ["sending"], outcome: "not-listed" },
      { blocklist: "Mailspike", target: "192.0.2.1", roles: ["sending"], outcome: "not-listed" },
      { blocklist: "Spamhaus ZEN", target: "192.0.2.1", roles: ["sending"], outcome: "not-listed" },
    ]);
    expect(blocklists.explanation).toMatch(/\S/);
  });

  it("looks up only single-address ip4:/ip6: entries, skipping ranges and include:d providers", async () => {
    const result = await scan("example.com", {
      "example.com": {
        MX: ["0 ."],
        TXT: ["v=spf1 ip4:192.0.2.1 ip4:192.0.2.2/32 ip4:198.51.100.0/24 ip6:2001:db8::1 include:_spf.example.net -all"],
      },
      "_spf.example.net": { TXT: ["v=spf1 ip4:203.0.113.5 -all"] },
      ...unlisted("192.0.2.1"),
      ...unlisted("192.0.2.2"),
    });

    const blocklists = checkOf(result, "blocklists");
    const ipLookups = blocklists.lookups.filter((l) => l.target !== "example.com");
    expect([...new Set(ipLookups.map((l) => l.target))]).toEqual(["192.0.2.1", "192.0.2.2", "2001:db8::1"]);
    expect(ipLookups.every((l) => l.roles.join() === "sending")).toBe(true);
  });

  it("is Inconclusive when the SPF lookup fails, since Sending IPs may be missing", async () => {
    const blocklists = checkOf(
      await scan("example.com", { "example.com": { MX: ["0 ."], TXT: "timeout" } }),
      "blocklists",
    );

    expect(blocklists.result).toBe("inconclusive");
  });
});

describe("Blocklist Check: Receiving IPs", () => {
  it("looks up the addresses of the MX hosts and fails when one is listed", async () => {
    const blocklists = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["10 mx1.example.com", "20 mx2.example.com"] },
        "mx1.example.com": { A: ["192.0.2.10"] },
        "mx2.example.com": { A: ["192.0.2.20"] },
        ...unlisted("192.0.2.10"),
        ...unlisted("192.0.2.20"),
        "20.2.0.192.psbl.surriel.com": { A: ["127.0.0.2"] },
      }),
      "blocklists",
    );

    expect(blocklists.result).toBe("fail");
    expect(blocklists.lookups.filter((l) => l.outcome === "listed")).toEqual([
      { blocklist: "PSBL", target: "192.0.2.20", roles: ["receiving"], outcome: "listed" },
    ]);
    expect(blocklists.lookups.filter((l) => l.target === "192.0.2.10").map((l) => l.outcome)).toEqual([
      "not-listed",
      "not-listed",
      "not-listed",
      "not-listed",
    ]);
  });

  it("looks up an IP that is both a Sending and a Receiving IP once, with both roles", async () => {
    const blocklists = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["10 mx.example.com"], TXT: ["v=spf1 ip4:192.0.2.1 mx -all"] },
        "mx.example.com": { A: ["192.0.2.1"] },
        ...unlisted("192.0.2.1"),
      }),
      "blocklists",
    );

    expect(blocklists.lookups.filter((l) => l.target !== "example.com").map((l) => [l.target, l.roles])).toEqual([
      ["192.0.2.1", ["sending", "receiving"]],
      ["192.0.2.1", ["sending", "receiving"]],
      ["192.0.2.1", ["sending", "receiving"]],
      ["192.0.2.1", ["sending", "receiving"]],
    ]);
  });

  it("is Inconclusive when the MX lookup fails, since Receiving IPs may be missing", async () => {
    const blocklists = checkOf(await scan("example.com", { "example.com": { MX: "error" } }), "blocklists");

    expect(blocklists.result).toBe("inconclusive");
  });
});

describe("Blocklist Check: outcomes", () => {
  it("passes when no IP is listed, counting the Blocklists checked", async () => {
    const blocklists = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["0 ."], TXT: ["v=spf1 ip4:192.0.2.1 -all"] },
        ...unlisted("192.0.2.1"),
      }),
      "blocklists",
    );

    expect(blocklists.result).toBe("pass");
    expect(blocklists.blocklists).toEqual(["SpamCop", "PSBL", "Mailspike", "Spamhaus ZEN", "Spamhaus DBL"]);
    expect(blocklists.explanation).toMatch(/5 Blocklists/);
  });

  it("treats a refused or unexpected answer code as Inconclusive, not as a listing", async () => {
    const blocklists = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["0 ."], TXT: ["v=spf1 ip4:192.0.2.1 -all"] },
        ...unlisted("192.0.2.1"),
        "1.2.0.192.bl.spamcop.net": { A: ["127.255.255.254"] },
      }),
      "blocklists",
    );

    expect(blocklists.result).toBe("inconclusive");
    expect(blocklists.lookups.find((l) => l.blocklist === "SpamCop")?.outcome).toBe("inconclusive");
  });

  it.each(["error", "timeout"] as const)("treats a Blocklist lookup %s as Inconclusive", async (failure) => {
    const blocklists = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["0 ."], TXT: ["v=spf1 ip4:192.0.2.1 -all"] },
        ...unlisted("192.0.2.1"),
        "1.2.0.192.psbl.surriel.com": { A: failure },
      }),
      "blocklists",
    );

    expect(blocklists.result).toBe("inconclusive");
    expect(blocklists.lookups.find((l) => l.blocklist === "PSBL")?.outcome).toBe("inconclusive");
  });

  it("counts a listing as a Fail even when another lookup is Inconclusive", async () => {
    const blocklists = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["0 ."], TXT: ["v=spf1 ip4:192.0.2.1 -all"] },
        "1.2.0.192.bl.spamcop.net": { A: ["127.0.0.2"] },
        "1.2.0.192.psbl.surriel.com": { A: "error" },
        "1.2.0.192.bl.mailspike.net": "nxdomain",
      }),
      "blocklists",
    );

    expect(blocklists.result).toBe("fail");
  });

  it.each([
    ["127.0.0.10", "listed"],
    ["127.0.0.12", "listed"],
    ["127.0.0.13", "not-listed"],
    ["127.0.0.20", "not-listed"],
  ] as const)("reads Mailspike's %s as %s (.13 and above are reputation scores)", async (code, outcome) => {
    const blocklists = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["0 ."], TXT: ["v=spf1 ip4:192.0.2.1 -all"] },
        ...unlisted("192.0.2.1"),
        "1.2.0.192.bl.mailspike.net": { A: [code] },
      }),
      "blocklists",
    );

    expect(blocklists.lookups.find((l) => l.blocklist === "Mailspike")?.outcome).toBe(outcome);
  });

  it("marks an IPv6 address as not applicable on IPv4-only Blocklists and leaves it out of the result", async () => {
    const resolver = fakeResolver({
      "example.com": { MX: ["10 mx.example.com"] },
      "mx.example.com": { AAAA: ["2001:db8::25"] },
      [`5.2.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.${ZEN}`]: "nxdomain",
    });
    const blocklists = checkOf(await scan("example.com", {}, { resolver }), "blocklists");

    expect(blocklists.lookups.filter((l) => l.target !== "example.com")).toEqual([
      { blocklist: "SpamCop", target: "2001:db8::25", roles: ["receiving"], outcome: "not-applicable" },
      { blocklist: "PSBL", target: "2001:db8::25", roles: ["receiving"], outcome: "not-applicable" },
      { blocklist: "Mailspike", target: "2001:db8::25", roles: ["receiving"], outcome: "not-applicable" },
      { blocklist: "Spamhaus ZEN", target: "2001:db8::25", roles: ["receiving"], outcome: "not-listed" },
    ]);
    expect(blocklists.result).toBe("pass");
    expect(blocklists.blocklists).toEqual(["Spamhaus ZEN", "Spamhaus DBL"]);
    expect(resolver.queries.filter((q) => IPV4_ONLY_ZONES.some((zone) => q.includes(zone)))).toEqual([]);
  });

  it("never queries a Spamhaus public zone (ADR-0002)", async () => {
    const resolver = fakeResolver({
      "example.com": { MX: ["10 mx.example.com"], TXT: ["v=spf1 ip4:192.0.2.1 -all"] },
      "mx.example.com": { A: ["192.0.2.10"] },
    });
    await scan("example.com", {}, { resolver });

    expect(resolver.queries.some((q) => q.split(" ")[0].endsWith("spamhaus.org"))).toBe(false);
    expect(resolver.queries).toContain("10.2.0.192.bl.spamcop.net A");
  });
});
