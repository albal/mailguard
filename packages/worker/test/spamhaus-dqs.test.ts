import { describe, expect, it } from "vitest";
import { fakeResolver, type DnsScript } from "./fake-resolver";
import { checkOf, scan, scanRequest, TEST_DQS_KEY } from "./scan-helpers";

// Spamhaus through DQS (ADR-0002): DBL for the Domain, ZEN for Sending and
// Receiving IPs, queried as `<target>.<key>.<zone>.dq.spamhaus.net`.

const ZEN = `${TEST_DQS_KEY}.zen.dq.spamhaus.net`;
const DBL = `${TEST_DQS_KEY}.dbl.dq.spamhaus.net`;

describe("Spamhaus DBL (Domain)", () => {
  it("fails when the Domain is listed on DBL, showing it in the Reputation column", async () => {
    const blocklists = checkOf(
      await scan("example.com", { "example.com": { MX: ["0 ."] }, [`example.com.${DBL}`]: { A: ["127.0.1.2"] } }),
      "blocklists",
    );

    expect(blocklists.result).toBe("fail");
    expect(blocklists.lookups).toContainEqual({
      blocklist: "Spamhaus DBL",
      target: "example.com",
      roles: ["domain"],
      outcome: "listed",
    });
    expect(blocklists.blocklists).toContain("Spamhaus DBL");
  });
});

describe("Spamhaus ZEN (Sending and Receiving IPs)", () => {
  it("fails when an IPv6 Sending IP is listed, querying its reversed nibbles", async () => {
    const nibbles = "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2";
    const resolver = fakeResolver({
      "example.com": { MX: ["0 ."], TXT: ["v=spf1 ip6:2001:db8::1 -all"] },
      [`example.com.${DBL}`]: "nxdomain",
      [`${nibbles}.${ZEN}`]: { A: ["127.0.0.3"] },
    });
    const blocklists = checkOf(await scan("example.com", {}, { resolver }), "blocklists");

    expect(resolver.queries).toContain(`${nibbles}.${ZEN} A`);
    expect(blocklists.result).toBe("fail");
    expect(blocklists.lookups).toContainEqual({
      blocklist: "Spamhaus ZEN",
      target: "2001:db8::1",
      roles: ["sending"],
      outcome: "listed",
    });
  });
});

describe("Spamhaus refusals and errors", () => {
  /** A Domain with one Receiving IP, 192.0.2.10, not listed on the non-Spamhaus Blocklists. */
  const base: DnsScript = {
    "example.com": { MX: ["10 mx.example.com"] },
    "mx.example.com": { A: ["192.0.2.10"] },
    "10.2.0.192.bl.spamcop.net": "nxdomain",
    "10.2.0.192.psbl.surriel.com": "nxdomain",
    "10.2.0.192.bl.mailspike.net": "nxdomain",
  };

  it.each(["127.255.255.252", "127.255.255.254", "127.255.255.255"])(
    "treats ZEN's error code %s as Inconclusive, not a listing",
    async (code) => {
      const result = await scan("example.com", {
        ...base,
        [`example.com.${DBL}`]: "nxdomain",
        [`10.2.0.192.${ZEN}`]: { A: [code] },
      });
      const blocklists = checkOf(result, "blocklists");

      expect(blocklists.lookups.find((l) => l.blocklist === "Spamhaus ZEN")?.outcome).toBe("inconclusive");
      expect(blocklists.result).toBe("inconclusive");
    },
  );

  it("treats DBL's error code as Inconclusive", async () => {
    const blocklists = checkOf(
      await scan("example.com", {
        ...base,
        [`example.com.${DBL}`]: { A: ["127.255.255.254"] },
        [`10.2.0.192.${ZEN}`]: "nxdomain",
      }),
      "blocklists",
    );

    expect(blocklists.lookups.find((l) => l.blocklist === "Spamhaus DBL")?.outcome).toBe("inconclusive");
    expect(blocklists.result).toBe("inconclusive");
  });

  it("treats SERVFAIL (e.g. an inactive key) as Inconclusive", async () => {
    const blocklists = checkOf(
      await scan("example.com", {
        ...base,
        [`example.com.${DBL}`]: { A: "error" },
        [`10.2.0.192.${ZEN}`]: { A: "error" },
      }),
      "blocklists",
    );

    expect(blocklists.lookups.filter((l) => l.blocklist.startsWith("Spamhaus")).map((l) => l.outcome)).toEqual([
      "inconclusive",
      "inconclusive",
    ]);
    expect(blocklists.result).toBe("inconclusive");
  });

  it("makes every Spamhaus lookup Inconclusive, and the Verdict Incomplete, when no DQS key is configured", async () => {
    const resolver = fakeResolver({
      ...base,
      "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject"] },
      "example.com": { MX: ["10 mx.example.com"], TXT: ["v=spf1 mx -all"] },
    });
    const result = await scan("example.com", {}, { resolver }, { env: { SPAMHAUS_DQS_KEY: undefined } });
    const blocklists = checkOf(result, "blocklists");

    expect(blocklists.lookups.filter((l) => l.blocklist.startsWith("Spamhaus"))).toEqual([
      { blocklist: "Spamhaus DBL", target: "example.com", roles: ["domain"], outcome: "inconclusive" },
      { blocklist: "Spamhaus ZEN", target: "192.0.2.10", roles: ["receiving"], outcome: "inconclusive" },
    ]);
    expect(blocklists.result).toBe("inconclusive");
    expect(result.verdict).toBe("incomplete");
    expect(resolver.queries.some((q) => q.includes("spamhaus"))).toBe(false);
  });
});

describe("Spamhaus key and zones (ADR-0002)", () => {
  it("only queries DQS zones, never a public spamhaus.org zone, and keeps the key out of the response", async () => {
    const resolver = fakeResolver({
      "example.com": { MX: ["10 mx.example.com"], TXT: ["v=spf1 ip4:192.0.2.1 ip6:2001:db8::1 -all"] },
      "mx.example.com": { A: ["192.0.2.10"], AAAA: ["2001:db8::25"] },
    });
    const response = await scanRequest("https://api.mailguard.test/api/scan?domain=example.com", {}, { resolver });
    const names = resolver.queries.map((q) => q.split(" ")[0]);

    expect(names.some((name) => name.endsWith("spamhaus.org"))).toBe(false);
    expect(names.filter((name) => name.includes("spamhaus"))).toHaveLength(5);
    expect(names.filter((name) => name.includes("spamhaus")).every((name) => name.endsWith(`.${TEST_DQS_KEY}.zen.dq.spamhaus.net`) || name.endsWith(`.${TEST_DQS_KEY}.dbl.dq.spamhaus.net`))).toBe(true);
    expect(await response.text()).not.toContain(TEST_DQS_KEY);
  });
});
