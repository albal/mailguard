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
    expect(dmarc.policySource).toBe("domain");
    expect(dmarc.record).toBe("v=DMARC1; p=reject; rua=mailto:d@example.com");
    expect(dmarc.policy).toBe("reject");
    expect(dmarc.testMode).toBe(false);
    expect(dmarc.explanation).toMatch(/\S/);
  });

  it("falls back to the Organizational Domain when a subdomain has no record", async () => {
    const dmarc = checkOf(
      await scan("mail.example.co.uk", { "_dmarc.example.co.uk": { TXT: ["v=DMARC1; p=quarantine"] } }),
      "dmarc",
    );

    expect(dmarc.result).toBe("pass");
    expect(dmarc.policyDomain).toBe("example.co.uk");
    expect(dmarc.policySource).toBe("organizational-domain");
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
    expect(dmarc.policySource).toBe("domain");
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

  // RFC 9989 §4.10 DNS Tree Walk.
  describe("DNS Tree Walk", () => {
    it("takes the policy from the highest name with a record", async () => {
      const dmarc = checkOf(
        await scan("x.a.example.com", {
          "_dmarc.a.example.com": { TXT: ["v=DMARC1; p=none"] },
          "_dmarc.example.com": { TXT: ["v=DMARC1; p=reject"] },
        }),
        "dmarc",
      );

      expect(dmarc.policyDomain).toBe("example.com");
      expect(dmarc.policySource).toBe("organizational-domain");
      expect(dmarc.policy).toBe("reject");
    });

    it("stops at a psd=n record, which marks its own domain as the Organizational Domain", async () => {
      const dmarc = checkOf(
        await scan("x.a.example.com", {
          "_dmarc.a.example.com": { TXT: ["v=DMARC1; p=quarantine; psd=n"] },
          "_dmarc.example.com": { TXT: ["v=DMARC1; p=none"] },
        }),
        "dmarc",
      );

      expect(dmarc.policyDomain).toBe("a.example.com");
      expect(dmarc.policy).toBe("quarantine");
    });

    it("stops at a psd=y record and uses the record one label below it (the Organizational Domain)", async () => {
      const dmarc = checkOf(
        await scan("mail.giant.bank.example", {
          "_dmarc.giant.bank.example": { TXT: ["v=DMARC1; p=reject"] },
          "_dmarc.bank.example": { TXT: ["v=DMARC1; p=none; psd=y"] },
          "_dmarc.example": { TXT: ["v=DMARC1; p=none"] },
        }),
        "dmarc",
      );

      expect(dmarc.policyDomain).toBe("giant.bank.example");
      expect(dmarc.policySource).toBe("organizational-domain");
      expect(dmarc.result).toBe("pass");
    });

    it("falls back to the Public Suffix Domain's psd=y record when the Organizational Domain has none", async () => {
      const dmarc = checkOf(
        await scan("mail.giant.bank.example", {
          "_dmarc.bank.example": { TXT: ["v=DMARC1; p=quarantine; psd=y"] },
        }),
        "dmarc",
      );

      expect(dmarc.policyDomain).toBe("bank.example");
      expect(dmarc.policySource).toBe("public-suffix-domain");
      expect(dmarc.policy).toBe("quarantine");
    });

    it("shortens a name of more than 8 labels to 7 before walking up", async () => {
      const dmarc = checkOf(
        await scan("a.b.c.d.e.f.g.h.i.j.k.example.com", {
          "_dmarc.g.h.i.j.k.example.com": { TXT: ["v=DMARC1; p=reject"] },
        }),
        "dmarc",
      );

      expect(dmarc.policyDomain).toBe("g.h.i.j.k.example.com");
    });

    it("never queries the labels skipped by shortening", async () => {
      const dmarc = checkOf(
        await scan("a.b.c.d.e.f.g.h.i.j.k.example.com", {
          "_dmarc.f.g.h.i.j.k.example.com": { TXT: ["v=DMARC1; p=reject"] },
        }),
        "dmarc",
      );

      expect(dmarc.result).toBe("fail");
      expect(dmarc.policyDomain).toBeNull();
    });

    it("keeps walking past a name with several DMARC records", async () => {
      const dmarc = checkOf(
        await scan("mail.example.com", {
          "_dmarc.mail.example.com": { TXT: ["v=DMARC1; p=reject", "v=DMARC1; p=none"] },
          "_dmarc.example.com": { TXT: ["v=DMARC1; p=quarantine"] },
        }),
        "dmarc",
      );

      expect(dmarc.policyDomain).toBe("example.com");
    });

    it("finds a policy at a top-level domain", async () => {
      const dmarc = checkOf(await scan("mail.example.com", { "_dmarc.com": { TXT: ["v=DMARC1; p=reject"] } }), "dmarc");

      expect(dmarc.policyDomain).toBe("com");
    });
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

  // DMARC grading (RFC 9989 semantics), row by row.
  it.each([
    ["p=reject", "v=DMARC1; p=reject", "pass"],
    ["p=quarantine", "v=DMARC1; p=quarantine", "pass"],
    ["p=reject with t=n", "v=DMARC1; p=reject; t=n", "pass"],
    ["p=none", "v=DMARC1; p=none; rua=mailto:d@example.com", "warning"],
    ["test mode (t=y)", "v=DMARC1; p=reject; t=y", "warning"],
    ["no p= tag (treated as p=none)", "v=DMARC1; rua=mailto:d@example.com", "warning"],
    ["an invalid p= with a valid rua (treated as p=none)", "v=DMARC1; p=block; rua=mailto:d@example.com", "warning"],
    ["an invalid np= with a valid rua (treated as p=none)", "v=DMARC1; p=reject; np=maybe; rua=mailto:d@example.com", "warning"],
    ["an invalid p= and no rua (no DMARC processing)", "v=DMARC1; p=block", "fail"],
    ["an invalid sp= and no rua (no DMARC processing)", "v=DMARC1; p=reject; sp=maybe", "fail"],
    ["an invalid p= and an rua with no valid URI", "v=DMARC1; p=block; rua=not a uri", "fail"],
    ["pct below 100 (pct is no longer a DMARC tag)", "v=DMARC1; p=reject; pct=50", "pass"],
    ["an unknown tag (ignored)", "v=DMARC1; p=reject; zz=1", "pass"],
    ["a malformed tag (discarded)", "v=DMARC1; p=reject; garbage", "pass"],
    ["an invalid t= value (discarded, default t=n)", "v=DMARC1; p=reject; t=maybe", "pass"],
    ["a repeated tag (the first one counts)", "v=DMARC1; p=reject; p=none", "pass"],
  ] as const)("grades %s (%s) as %s", async (_, record, result) => {
    const dmarc = checkOf(await scan("example.com", { "_dmarc.example.com": { TXT: [record] } }), "dmarc");

    expect(dmarc.result).toBe(result);
    expect(dmarc.policyDomain).toBe("example.com");
    expect(dmarc.record).toBe(record);
  });

  it("reads policy values case-insensitively and tolerates spacing", async () => {
    const dmarc = checkOf(
      await scan("example.com", { "_dmarc.example.com": { TXT: ["v=DMARC1 ;P = Reject ; T = N;"] } }),
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

  it("reports test mode and explains it", async () => {
    const dmarc = checkOf(await scan("example.com", { "_dmarc.example.com": { TXT: ["v=DMARC1; p=quarantine; t=y"] } }), "dmarc");

    expect(dmarc.testMode).toBe(true);
    expect(dmarc.policy).toBe("quarantine");
    expect(dmarc.explanation).toMatch(/test mode/i);
  });
});
