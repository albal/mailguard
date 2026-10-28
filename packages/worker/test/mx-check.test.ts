import { describe, expect, it } from "vitest";
import { checkOf, scan } from "./scan-helpers";

describe("MX Check", () => {
  it("passes when the MX hosts resolve to addresses", async () => {
    const result = await scan("example.com", {
      "example.com": { MX: ["10 mx1.example.com", "20 mx2.example.com"] },
      "mx1.example.com": { A: ["192.0.2.1"] },
      "mx2.example.com": { AAAA: ["2001:db8::2"] },
    });

    const mx = checkOf(result, "mx");
    expect(mx.result).toBe("pass");
    expect(mx.hosts).toEqual([
      { preference: 10, exchange: "mx1.example.com", addresses: ["192.0.2.1"] },
      { preference: 20, exchange: "mx2.example.com", addresses: ["2001:db8::2"] },
    ]);
    expect(mx.explanation).toMatch(/\S/);
  });

  it("passes on a Null MX, which deliberately receives no mail", async () => {
    const mx = checkOf(await scan("example.com", { "example.com": { MX: ["0 ."] } }), "mx");

    expect(mx.result).toBe("pass");
    expect(mx.nullMx).toBe(true);
    expect(mx.hosts).toEqual([]);
    expect(mx.explanation).toMatch(/Null MX/);
  });

  it("warns when there is no MX but the Domain has an A or AAAA record (implicit MX)", async () => {
    const mx = checkOf(
      await scan("example.com", { "example.com": { A: ["192.0.2.10"], AAAA: ["2001:db8::10"] } }),
      "mx",
    );

    expect(mx.result).toBe("warning");
    expect(mx.implicitMxAddresses).toEqual(["192.0.2.10", "2001:db8::10"]);
    expect(mx.explanation).toMatch(/implicit MX/i);
  });

  it("fails when there is no MX and no A or AAAA record", async () => {
    const mx = checkOf(await scan("example.com", {}), "mx");

    expect(mx.result).toBe("fail");
  });

  it("fails when the MX hosts don't resolve", async () => {
    const mx = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["10 mx1.example.com", "20 mx2.example.com"] },
        "mx1.example.com": "nxdomain",
      }),
      "mx",
    );

    expect(mx.result).toBe("fail");
    expect(mx.hosts.map((h) => h.addresses)).toEqual([[], []]);
  });

  it("passes when at least one MX host resolves", async () => {
    const mx = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["10 mx1.example.com", "20 mx2.example.com"] },
        "mx2.example.com": { A: ["192.0.2.2"] },
      }),
      "mx",
    );

    expect(mx.result).toBe("pass");
  });
});

describe("MX Check when DNS can't answer", () => {
  it.each(["error", "timeout"] as const)("is Inconclusive when the MX lookup returns %s", async (outcome) => {
    const mx = checkOf(await scan("example.com", { "example.com": { MX: outcome } }), "mx");

    expect(mx.result).toBe("inconclusive");
  });

  it("is Inconclusive when the MX hosts' lookups time out or error", async () => {
    const mx = checkOf(
      await scan("example.com", {
        "example.com": { MX: ["10 mx1.example.com"] },
        "mx1.example.com": { A: "timeout", AAAA: "error" },
      }),
      "mx",
    );

    expect(mx.result).toBe("inconclusive");
  });

  it("is Inconclusive when the Check runs past its own timeout", async () => {
    const mx = checkOf(
      await scan("example.com", { "example.com": { MX: "hang" } }, { checkTimeoutMs: 20 }),
      "mx",
    );

    expect(mx.result).toBe("inconclusive");
    expect(mx.explanation).toMatch(/time/i);
  });
});
