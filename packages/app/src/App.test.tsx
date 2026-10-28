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

describe("Validating the input", () => {
  it.each([
    ["nothing", " "],
    ["an address with no Domain", "alice@"],
    ["a single label", "localhost"],
    ["a space inside the Domain", "exa mple.com"],
    ["an empty label", "a..b.com"],
    ["a hyphen at the start of a label", "-bad.com"],
    ["an underscore", "a_b.example.com"],
    ["an IP address", "192.0.2.1"],
    ["a port", "example.com:80"],
    ["a path", "example.com/path"],
    ["a percent-escape", "ex%41mple.com"],
  ])("rejects %s inline and makes no request", async (_, input) => {
    const api = stubScanApi(aScan());

    await startScan(input);

    const textbox = screen.getByRole("textbox", { name: /email address or domain/i });
    expect(textbox).toHaveAttribute("aria-invalid", "true");
    expect(textbox).toHaveAccessibleDescription(/valid email address or domain/i);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("clears the error once a valid Domain is scanned", async () => {
    const api = stubScanApi(aScan());
    await startScan("localhost");
    const textbox = screen.getByRole("textbox", { name: /email address or domain/i });

    await userEvent.clear(textbox);
    await userEvent.type(textbox, "example.com{Enter}");

    expect(textbox).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/valid email address or domain/i)).not.toBeInTheDocument();
    expect(api.requestedUrls()).toEqual(["/api/scan?domain=example.com"]);
  });

  it("accepts surrounding spaces, upper case and a trailing dot", async () => {
    const api = stubScanApi(aScan());

    await startScan("  Alice@Example.COM. ");

    expect(api.requestedUrls()).toEqual(["/api/scan?domain=example.com"]);
  });
});

describe("Internationalised Domains", () => {
  it("sends only the Punycode form", async () => {
    const api = stubScanApi(aScan({ domain: "xn--bcher-kva.de" }));

    await startScan("info@Bücher.de");

    expect(api.requestedUrls()).toEqual(["/api/scan?domain=xn--bcher-kva.de"]);
  });

  it("shows both the Unicode and Punycode forms of the Domain", async () => {
    stubScanApi(aScan({ domain: "xn--bcher-kva.de" }));

    await startScan("bücher.de");

    const verdict = await screen.findByRole("region", { name: /verdict/i });
    expect(verdict).toHaveTextContent("bücher.de");
    expect(verdict).toHaveTextContent("xn--bcher-kva.de");
  });

  it("makes a lookalike visible by showing its Punycode form", async () => {
    // "pаypal.com" with a Cyrillic "а" (U+0430).
    const lookalike = "pаypal.com";
    const api = stubScanApi(aScan({ domain: "xn--pypal-4ve.com" }));

    await startScan(lookalike);

    expect(api.requestedUrls()).toEqual(["/api/scan?domain=xn--pypal-4ve.com"]);
    const verdict = await screen.findByRole("region", { name: /verdict/i });
    expect(verdict).toHaveTextContent(lookalike);
    expect(verdict).toHaveTextContent("xn--pypal-4ve.com");
  });

  it("shows an ASCII Domain once", async () => {
    stubScanApi(aScan({ domain: "example.com" }));

    await startScan("example.com");

    const heading = await screen.findByRole("heading", { name: /verdict/i });
    expect(heading.textContent?.match(/example\.com/g)).toHaveLength(1);
  });
});

describe("A Domain that doesn't exist", () => {
  it("says so instead of showing a Verdict", async () => {
    const api = stubScanApi();

    await startScan("no-such-domain.example");
    api.respond({ domain: "no-such-domain.example", scannedAt: "2026-10-28T12:00:00.000Z", exists: false });

    expect(await screen.findByText(/this domain doesn't exist/i)).toBeInTheDocument();
    expect(screen.getByText(/no-such-domain\.example/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /verdict/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
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
