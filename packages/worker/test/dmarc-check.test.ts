import { describe, expect, it } from "vitest";
import type { ScriptedAnswer } from "./fake-resolver";
import { checkOf, scan } from "./scan-helpers";

describe("DMARC Check", () => {
  it("passes on p=reject published at the Domain itself", async () => {
    const dmarc = checkOf(
      await scan("example.com", { "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject; rua=mailto:d@example.com"] } }),
      "dmarc",
    );

    expect(dmarc.result).toBe("pass");
    expect(dmarc.policyDomain).toBe("example.com");
    expect(dmarc.inherited).toBe(false);
    expect(dmarc.record).toBe("v=DMARC1; p=reject; rua=mailto:d@example.com");
    expect(dmarc.policy).toBe("reject");
    expect(dmarc.pct).toBe(100);
    expect(dmarc.explanation).toMatch(/\S/);
  });

  it("falls back to the Organizational Domain when a subdomain has no record", async () => {
    const dmarc = checkOf(
      await scan("mail.example.co.uk", { "_dmarc.example.co.uk": { TXT: ["v=DMARC1; p=quarantine"] } }),
      "dmarc",
    );

    expect(dmarc.result).toBe("pass");
    expect(dmarc.policyDomain).toBe("example.co.uk");
    expect(dmarc.inherited).toBe(true);
    expect(dmarc.policy).toBe("quarantine");
    expect(dmarc.explanation).toContain("example.co.uk");
  });

  it("uses the subdomain's own record rather than the Organizational Domain's", async () => {
    const dmarc = checkOf(
      await scan("mail.example.com", {
        "_dmarc.mail.example.com": { TXT: ["v=DMARC1; p=none"] },
        "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject"] },
      }),
      "dmarc",
    );

    expect(dmarc.policyDomain).toBe("mail.example.com");
    expect(dmarc.inherited).toBe(false);
    expect(dmarc.policy).toBe("none");
  });

  it("ignores TXT records that aren't DMARC records when looking for one", async () => {
    const dmarc = checkOf(
      await scan("mail.example.com", {
        "_dmarc.mail.example.com": { TXT: ["some-verification=abc"] },
        "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject"] },
      }),
      "dmarc",
    );

    expect(dmarc.policyDomain).toBe("example.com");
  });

  it("applies sp= over p= when the policy is inherited", async () => {
    const dmarc = checkOf(
      await scan("mail.example.com", { "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject; sp=none"] } }),
      "dmarc",
    );

    expect(dmarc.result).toBe("warning");
    expect(dmarc.policy).toBe("none");
    expect(dmarc.explanation).toMatch(/sp=/);
  });

  it("uses p= when the inherited record has no sp=", async () => {
    const dmarc = checkOf(
      await scan("mail.example.com", { "_dmarc.example.com": { TXT: ["v=DMARC1; p=none"] } }),
      "dmarc",
    );

    expect(dmarc.result).toBe("warning");
    expect(dmarc.policy).toBe("none");
  });

  it("ignores sp= on the Domain's own record", async () => {
    const dmarc = checkOf(
      await scan("example.com", { "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject; sp=none"] } }),
      "dmarc",
    );

    expect(dmarc.result).toBe("pass");
    expect(dmarc.policy).toBe("reject");
  });

  // PRD §2.2 DMARC grading table, row by row.
  it.each([
    ["p=reject at 100%", "v=DMARC1; p=reject; pct=100", "pass"],
    ["p=quarantine at the default pct", "v=DMARC1; p=quarantine", "pass"],
    ["p=none", "v=DMARC1; p=none; rua=mailto:d@example.com", "warning"],
    ["pct below 100", "v=DMARC1; p=reject; pct=50", "warning"],
    ["p=quarantine with pct=0", "v=DMARC1; p=quarantine; pct=0", "warning"],
    ["no p= tag (invalid)", "v=DMARC1; rua=mailto:d@example.com", "fail"],
    ["an unknown policy (invalid)", "v=DMARC1; p=block", "fail"],
    ["an unknown sp= policy (invalid)", "v=DMARC1; p=reject; sp=maybe", "fail"],
    ["pct above 100 (invalid)", "v=DMARC1; p=reject; pct=150", "fail"],
    ["a non-numeric pct (invalid)", "v=DMARC1; p=reject; pct=all", "fail"],
    ["a repeated tag (invalid)", "v=DMARC1; p=reject; p=none", "fail"],
    ["a malformed tag (invalid)", "v=DMARC1; p=reject; garbage", "fail"],
  ] as const)("grades %s as %s", async (_, record, result) => {
    const dmarc = checkOf(await scan("example.com", { "_dmarc.example.com": { TXT: [record] } }), "dmarc");

    expect(dmarc.result).toBe(result);
    expect(dmarc.policyDomain).toBe("example.com");
    expect(dmarc.record).toBe(record);
  });

  it("reads policy values case-insensitively and tolerates spacing", async () => {
    const dmarc = checkOf(
      await scan("example.com", { "_dmarc.example.com": { TXT: ["v=DMARC1 ;P = Reject ; pct= 100;"] } }),
      "dmarc",
    );

    expect(dmarc.result).toBe("pass");
    expect(dmarc.policy).toBe("reject");
  });

  it("fails when there is no record at the Domain or its Organizational Domain", async () => {
    const dmarc = checkOf(await scan("mail.example.com", { "_dmarc.example.com": "nxdomain" }), "dmarc");

    expect(dmarc.result).toBe("fail");
    expect(dmarc.policyDomain).toBeNull();
    expect(dmarc.record).toBeNull();
  });

  it("fails when the Domain is its own Organizational Domain and has no record", async () => {
    const dmarc = checkOf(await scan("example.com", {}), "dmarc");

    expect(dmarc.result).toBe("fail");
  });

  it("treats more than one DMARC record as no record", async () => {
    const dmarc = checkOf(
      await scan("example.com", { "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject", "v=DMARC1; p=none"] } }),
      "dmarc",
    );

    expect(dmarc.result).toBe("fail");
  });

  it.each<[string, ScriptedAnswer]>([
    ["times out", "timeout"],
    ["gets a refused or error response", "error"],
  ])("is Inconclusive when the Domain's lookup %s", async (_, answer) => {
    const dmarc = checkOf(
      await scan("mail.example.com", {
        "_dmarc.mail.example.com": { TXT: answer },
        "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject"] },
      }),
      "dmarc",
    );

    expect(dmarc.result).toBe("inconclusive");
  });

  it.each<[string, ScriptedAnswer]>([
    ["times out", "timeout"],
    ["gets a refused or error response", "error"],
  ])("is Inconclusive when the Organizational Domain's lookup %s", async (_, answer) => {
    const dmarc = checkOf(await scan("mail.example.com", { "_dmarc.example.com": { TXT: answer } }), "dmarc");

    expect(dmarc.result).toBe("inconclusive");
  });

  it("is Inconclusive when DNS never answers before the Check's timeout", async () => {
    const dmarc = checkOf(
      await scan("example.com", { "_dmarc.example.com": { TXT: "hang" } }, { checkTimeoutMs: 20 }),
      "dmarc",
    );

    expect(dmarc.result).toBe("inconclusive");
  });
});
