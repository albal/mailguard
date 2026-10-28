import { describe, expect, it } from "vitest";
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
});
