import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { aDmarcCheck, aScan, anMxCheck, stubScanApi } from "./test/scan-api-stub";

async function startScan(input: string) {
  render(<App />);
  await userEvent.type(screen.getByRole("textbox", { name: /email address or domain/i }), input);
  await userEvent.click(screen.getByRole("button", { name: /scan/i }));
}

describe("Starting a Scan", () => {
  it("sends only the Domain, never the part before the @", async () => {
    const api = stubScanApi(aScan());

    await startScan("alice@example.com");

    expect(api.requestedUrls()).toEqual(["/api/scan?domain=example.com"]);
    expect(api.requestedUrls().join()).not.toContain("alice");
  });

  it("starts a Scan when Enter is pressed", async () => {
    const api = stubScanApi(aScan());
    render(<App />);

    await userEvent.type(screen.getByRole("textbox", { name: /email address or domain/i }), "example.com{Enter}");

    expect(api.requestedUrls()).toEqual(["/api/scan?domain=example.com"]);
  });
});

describe("When the Scan API fails", () => {
  it("tells the user the Scan couldn't be completed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));

    await startScan("example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be completed/i);
  });
});

describe("Showing a Scan", () => {
  it("shows a skeleton while the Scan runs, then the Verdict and the MX card", async () => {
    const api = stubScanApi();

    await startScan("alice@example.com");

    expect(screen.getByRole("status", { name: /scanning/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /verdict/i })).not.toBeInTheDocument();

    api.respond(
      aScan({
        verdict: "well-configured",
        checks: [anMxCheck({ result: "pass", explanation: "Mail for this domain can be delivered." })],
      }),
    );

    expect(await screen.findByRole("heading", { name: /verdict/i })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /scanning/i })).not.toBeInTheDocument();
    expect(screen.getByText("Well Configured")).toBeInTheDocument();
    const mxCard = screen.getByRole("article", { name: "MX" });
    expect(within(mxCard).getByText("Mail for this domain can be delivered.")).toBeInTheDocument();
    expect(within(mxCard).getByText("mx.example.com")).toBeInTheDocument();
  });

  it.each([
    ["high-risk", "High Risk"],
    ["at-risk", "At Risk"],
    ["incomplete", "Incomplete"],
    ["well-configured", "Well Configured"],
  ] as const)("names the %s Verdict as %s", async (verdict, label) => {
    stubScanApi(aScan({ verdict }));

    await startScan("example.com");

    const section = await screen.findByRole("region", { name: /verdict/i });
    expect(section).toHaveTextContent(label);
  });

  it("shows the time the Scan was performed", async () => {
    stubScanApi(aScan({ scannedAt: "2026-10-28T12:34:00.000Z" }));

    await startScan("example.com");

    const time = await screen.findByText((_, el) => el?.tagName === "TIME");
    expect(time).toHaveAttribute("datetime", "2026-10-28T12:34:00.000Z");
  });

  it.each([
    ["pass", "✓", "Pass"],
    ["warning", "!", "Warning"],
    ["fail", "✕", "Fail"],
    ["inconclusive", "?", "Inconclusive"],
  ] as const)("shows a %s Check Result with its icon and label", async (result, icon, label) => {
    stubScanApi(aScan({ checks: [anMxCheck({ result })] }));

    await startScan("example.com");

    const mxCard = await screen.findByRole("article", { name: "MX" });
    const checkResult = within(mxCard).getByTestId("check-result");
    expect(checkResult).toHaveTextContent(`${icon} ${label}`);
  });
});

describe("The DMARC card", () => {
  it("shows the record and names the domain the policy came from", async () => {
    stubScanApi(
      aScan({
        domain: "mail.example.com",
        checks: [
          aDmarcCheck({
            result: "warning",
            explanation: "This domain inherits the DMARC policy of example.com.",
            policyDomain: "example.com",
            policySource: "organizational-domain",
            record: "v=DMARC1; p=reject; sp=none",
            policy: "none",
          }),
        ],
      }),
    );

    await startScan("mail.example.com");

    const card = await screen.findByRole("article", { name: "DMARC" });
    expect(within(card).getByTestId("check-result")).toHaveTextContent("! Warning");
    expect(within(card).getByText("v=DMARC1; p=reject; sp=none")).toBeInTheDocument();
    expect(within(card).getByText(/found at/i)).toHaveTextContent("Policy found at _dmarc.example.com (inherited from the Organizational Domain)");
    expect(screen.getByRole("region", { name: "Security Protocols" })).toContainElement(card);
  });

  it("says when no DMARC record was found", async () => {
    stubScanApi(
      aScan({ checks: [aDmarcCheck({ result: "fail", policyDomain: null, policySource: null, record: null, policy: null })] }),
    );

    await startScan("example.com");

    const card = await screen.findByRole("article", { name: "DMARC" });
    expect(within(card).getByText(/no dmarc record found/i)).toBeInTheDocument();
  });

  it("says when the policy came from the Public Suffix Domain", async () => {
    stubScanApi(
      aScan({
        checks: [
          aDmarcCheck({ policyDomain: "bank.example", policySource: "public-suffix-domain", record: "v=DMARC1; p=reject; psd=y" }),
        ],
      }),
    );

    await startScan("mail.giant.bank.example");

    const card = await screen.findByRole("article", { name: "DMARC" });
    expect(within(card).getByText(/found at/i)).toHaveTextContent("Policy found at _dmarc.bank.example (inherited from the public suffix)");
  });
});
