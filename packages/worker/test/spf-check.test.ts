import { describe, expect, it } from "vitest";
import type { DnsScript } from "./fake-resolver";
import { checkOf, scan } from "./scan-helpers";

describe("SPF Check", () => {
  it("fails when the Domain has no SPF record", async () => {
    const spf = checkOf(
      await scan("example.com", { "example.com": { TXT: ["google-site-verification=abc"] } }),
      "spf",
    );

    expect(spf.result).toBe("fail");
    expect(spf.records).toEqual([]);
    expect(spf.explanation).toMatch(/no SPF record/i);
  });

  it.each([
    ["-all", "-"],
    ["~all", "~"],
  ] as const)("passes on %s", async (all, qualifier) => {
    const spf = checkOf(
      await scan("example.com", { "example.com": { TXT: ["some-other=txt", `v=spf1 ip4:192.0.2.1 ${all}`] } }),
      "spf",
    );

    expect(spf.result).toBe("pass");
    expect(spf.records).toEqual([`v=spf1 ip4:192.0.2.1 ${all}`]);
    expect(spf.allQualifier).toBe(qualifier);
    expect(spf.lookupCount).toBe(0);
  });

  it.each(["+all", "all", "+ALL"])("fails on %s, which authorises every server on the internet", async (all) => {
    const spf = checkOf(await scan("example.com", { "example.com": { TXT: [`v=spf1 mx ${all}`] } }), "spf");

    expect(spf.result).toBe("fail");
    expect(spf.allQualifier).toBe("+");
    expect(spf.explanation).toMatch(/\+all/);
  });

  it("warns on ?all, a neutral policy", async () => {
    const spf = checkOf(await scan("example.com", { "example.com": { TXT: ["v=spf1 ip4:192.0.2.1 ?all"] } }), "spf");

    expect(spf.result).toBe("warning");
    expect(spf.allQualifier).toBe("?");
    expect(spf.explanation).toMatch(/\?all/);
  });

  it("warns when there is no all mechanism, which leaves other senders neutral", async () => {
    const spf = checkOf(await scan("example.com", { "example.com": { TXT: ["v=spf1 ip4:192.0.2.1"] } }), "spf");

    expect(spf.result).toBe("warning");
    expect(spf.allQualifier).toBeNull();
    expect(spf.explanation).toMatch(/no "all"/i);
  });

  it("fails when the Domain has more than one SPF record", async () => {
    const spf = checkOf(
      await scan("example.com", { "example.com": { TXT: ["v=spf1 -all", "V=SPF1 ip4:192.0.2.1 ~all"] } }),
      "spf",
    );

    expect(spf.result).toBe("fail");
    expect(spf.records).toEqual(["v=spf1 -all", "V=SPF1 ip4:192.0.2.1 ~all"]);
    expect(spf.explanation).toMatch(/more than one SPF record/i);
  });

  it("doesn't mistake a v=spf10 record for SPF", async () => {
    const spf = checkOf(await scan("example.com", { "example.com": { TXT: ["v=spf10 -all", "v=spf1 -all"] } }), "spf");

    expect(spf.result).toBe("pass");
    expect(spf.records).toEqual(["v=spf1 -all"]);
  });
});

describe("SPF DNS lookup limit", () => {
  it("counts include, a, mx, ptr and exists through nested includes, but not ip4, ip6 or all", async () => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": { TXT: ["v=spf1 a mx ip4:192.0.2.1 include:_spf.example.net ~all"] },
        "_spf.example.net": { TXT: ["v=spf1 ip6:2001:db8::/32 include:_spf2.example.net ptr -all"] },
        "_spf2.example.net": { TXT: ["v=spf1 exists:%{i}.example.net a:mail.example.net ?all"] },
      }),
      "spf",
    );

    // a, mx, include → (include → (exists, a), ptr)
    expect(spf.lookupCount).toBe(7);
    expect(spf.result).toBe("pass");
  });

  it("passes with exactly 10 DNS lookups", async () => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": { TXT: ["v=spf1 include:_spf.example.net a a a a a a a a -all"] },
        "_spf.example.net": { TXT: ["v=spf1 mx -all"] },
      }),
      "spf",
    );

    expect(spf.lookupCount).toBe(10);
    expect(spf.result).toBe("pass");
  });

  it("fails when nested includes need more than 10 DNS lookups", async () => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": { TXT: ["v=spf1 include:_spf.example.net a a a a a a a a -all"] },
        "_spf.example.net": { TXT: ["v=spf1 mx a -all"] },
      }),
      "spf",
    );

    expect(spf.result).toBe("fail");
    expect(spf.lookupCount).toBeGreaterThan(10);
    expect(spf.explanation).toMatch(/10 DNS lookups/);
  });

  it("fails on an include loop rather than following it forever", async () => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": { TXT: ["v=spf1 include:_spf.example.net -all"] },
        "_spf.example.net": { TXT: ["v=spf1 include:example.com -all"] },
      }),
      "spf",
    );

    expect(spf.result).toBe("fail");
  });

  it.each([
    ["has no SPF record", { TXT: ["not spf"] }],
    ["doesn't exist", "nxdomain"],
    ["has a syntax error", { TXT: ["v=spf1 bogus -all"] }],
    ["has two SPF records", { TXT: ["v=spf1 -all", "v=spf1 ~all"] }],
  ] as [string, DnsScript[string]][])("fails when an included domain %s", async (_, included) => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": { TXT: ["v=spf1 include:_spf.example.net -all"] },
        "_spf.example.net": included,
      }),
      "spf",
    );

    expect(spf.result).toBe("fail");
    expect(spf.explanation).toMatch(/_spf\.example\.net/);
  });

  it.each(["error", "timeout"] as const)("is Inconclusive when an included record's lookup returns %s", async (outcome) => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": { TXT: ["v=spf1 include:_spf.example.net -all"] },
        "_spf.example.net": { TXT: outcome },
      }),
      "spf",
    );

    expect(spf.result).toBe("inconclusive");
  });
});

describe("SPF redirect", () => {
  it.each([
    ["-all", "pass", "-"],
    ["?all", "warning", "?"],
    ["+all", "fail", "+"],
  ] as const)("grades by the redirect target's all (%s) and counts redirect as a lookup", async (all, result, qualifier) => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": { TXT: ["v=spf1 a redirect=_spf.example.net"] },
        "_spf.example.net": { TXT: [`v=spf1 mx ${all}`] },
      }),
      "spf",
    );

    expect(spf.result).toBe(result);
    expect(spf.allQualifier).toBe(qualifier);
    expect(spf.lookupCount).toBe(3);
  });

  it("is ignored when the record has its own all", async () => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": { TXT: ["v=spf1 -all redirect=_spf.example.net"] },
        "_spf.example.net": { TXT: ["v=spf1 +all"] },
      }),
      "spf",
    );

    expect(spf.result).toBe("pass");
    expect(spf.lookupCount).toBe(0);
  });

  it("fails when the redirect target has no SPF record", async () => {
    const spf = checkOf(
      await scan("example.com", { "example.com": { TXT: ["v=spf1 redirect=_spf.example.net"] } }),
      "spf",
    );

    expect(spf.result).toBe("fail");
    expect(spf.explanation).toMatch(/_spf\.example\.net/);
  });
});

describe("Sending IPs", () => {
  it("are the single ip4/ip6 addresses of the Domain's own record, skipping ranges, non-+ qualifiers and includes", async () => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": {
          TXT: [
            "v=spf1 ip4:192.0.2.1 +ip4:192.0.2.2/32 ip4:198.51.100.0/24 -ip4:192.0.2.9 ip6:2001:db8::1 ip6:2001:db8::2/128 ip6:2001:db8:1::/48 include:_spf.example.net ~all",
          ],
        },
        "_spf.example.net": { TXT: ["v=spf1 ip4:203.0.113.5 -all"] },
      }),
      "spf",
    );

    expect(spf.sendingIps).toEqual(["192.0.2.1", "192.0.2.2", "2001:db8::1", "2001:db8::2"]);
  });
});

describe("SPF syntax", () => {
  it.each([
    ["an unknown mechanism", "v=spf1 ipv4:192.0.2.1 -all"],
    ["a malformed ip4 address", "v=spf1 ip4:192.0.2.256 -all"],
    ["an ip4 prefix length over 32", "v=spf1 ip4:192.0.2.0/33 -all"],
    ["a malformed ip6 address", "v=spf1 ip6:2001:db8::g -all"],
    ["an ip6 prefix length over 128", "v=spf1 ip6:2001:db8::/129 -all"],
    ["an include with no domain", "v=spf1 include: -all"],
    ["an all with an argument", "v=spf1 all:example.com"],
    ["redirect given twice", "v=spf1 redirect=a.example.com redirect=b.example.com"],
    ["a qualifier on a modifier", "v=spf1 -redirect=a.example.com"],
  ])("fails on %s", async (_, record) => {
    const spf = checkOf(await scan("example.com", { "example.com": { TXT: [record] } }), "spf");

    expect(spf.result).toBe("fail");
    expect(spf.explanation).toMatch(/syntax error/i);
  });

  it("accepts macros, unknown modifiers and CIDR suffixes on a and mx", async () => {
    const spf = checkOf(
      await scan("example.com", {
        "example.com": {
          TXT: ["v=spf1 exists:%{i}._spf.example.com a/24 mx:mail.example.com/24//64 ip6:2001:db8::/32 foo=bar -all"],
        },
      }),
      "spf",
    );

    expect(spf.result).toBe("pass");
  });
});

describe("SPF Check when DNS can't answer", () => {
  it.each(["error", "timeout"] as const)("is Inconclusive when the TXT lookup returns %s", async (outcome) => {
    const spf = checkOf(await scan("example.com", { "example.com": { TXT: outcome } }), "spf");

    expect(spf.result).toBe("inconclusive");
  });

  it("is Inconclusive when the Check runs past its own timeout", async () => {
    const spf = checkOf(await scan("example.com", { "example.com": { TXT: "hang" } }, { checkTimeoutMs: 20 }), "spf");

    expect(spf.result).toBe("inconclusive");
    expect(spf.explanation).toMatch(/time/i);
  });
});
