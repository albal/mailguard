import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { aScan, anMxCheck, stubScanApi } from "./test/scan-api-stub";

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
