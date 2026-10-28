import { describe, expect, it } from "vitest";
import { createDohResolver } from "../src/doh-resolver";
import { checkOf, scan } from "./scan-helpers";

// The production Resolver, driven through the Worker seam with Cloudflare's
// DoH JSON API faked at the HTTP level (response shapes captured from
// cloudflare-dns.com).

type DohAnswer = { name: string; type: number; TTL: number; data: string };
type DohReply = { Status: number; Answer?: DohAnswer[] } | "hang" | Response;

const TYPE = { A: 1, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 } as const;

function fakeDoh(replies: Record<string, DohReply>) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    const reply = replies[`${url.searchParams.get("name")} ${url.searchParams.get("type")}`] ?? { Status: 0 };
    if (reply === "hang") {
      const signal = request.signal as unknown as EventTarget;
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(request.signal.reason)));
    }
    if (reply instanceof Response) return reply;
    return Response.json({ TC: false, RD: true, RA: true, AD: false, CD: false, ...reply });
  };
  return { fetch, requests };
}

describe("DoH Resolver", () => {
  it("queries Cloudflare DoH for JSON and reads MX and address answers", async () => {
    const doh = fakeDoh({
      "example.com MX": {
        Status: 0,
        Answer: [{ name: "example.com", type: TYPE.MX, TTL: 300, data: "10 mx.example.com." }],
      },
      "mx.example.com A": {
        Status: 0,
        Answer: [
          { name: "mx.example.com", type: TYPE.CNAME, TTL: 300, data: "mail.example.net." },
          { name: "mail.example.net", type: TYPE.A, TTL: 300, data: "192.0.2.1" },
        ],
      },
    });

    const mx = checkOf(await scan("example.com", {}, { resolver: createDohResolver({ fetch: doh.fetch }) }), "mx");

    expect(mx.result).toBe("pass");
    expect(mx.hosts).toEqual([{ preference: 10, exchange: "mx.example.com", addresses: ["192.0.2.1"] }]);
    const first = doh.requests[0];
    expect(new URL(first.url).origin).toBe("https://cloudflare-dns.com");
    expect(first.headers.get("accept")).toBe("application/dns-json");
  });

  it("reads a Null MX", async () => {
    const doh = fakeDoh({
      "example.com MX": { Status: 0, Answer: [{ name: "example.com", type: TYPE.MX, TTL: 300, data: "0 ." }] },
    });

    const mx = checkOf(await scan("example.com", {}, { resolver: createDohResolver({ fetch: doh.fetch }) }), "mx");

    expect(mx.result).toBe("pass");
    expect(mx.nullMx).toBe(true);
  });

  it("treats NXDOMAIN for MX hosts as not resolving", async () => {
    const doh = fakeDoh({
      "example.com MX": {
        Status: 0,
        Answer: [{ name: "example.com", type: TYPE.MX, TTL: 300, data: "10 gone.example.com." }],
      },
      "gone.example.com A": { Status: 3 },
      "gone.example.com AAAA": { Status: 3 },
    });

    const mx = checkOf(await scan("example.com", {}, { resolver: createDohResolver({ fetch: doh.fetch }) }), "mx");

    expect(mx.result).toBe("fail");
  });

  it.each([
    ["SERVFAIL", { Status: 2 }],
    ["REFUSED", { Status: 5 }],
    ["an HTTP error", new Response('{"error":"Invalid query name"}', { status: 400 })],
  ] as const)("reports %s as an error, making the Check Inconclusive", async (_, reply) => {
    const doh = fakeDoh({ "example.com MX": reply });

    const mx = checkOf(await scan("example.com", {}, { resolver: createDohResolver({ fetch: doh.fetch }) }), "mx");

    expect(mx.result).toBe("inconclusive");
  });

  it("gives up on a query after its own timeout, making the Check Inconclusive", async () => {
    const doh = fakeDoh({ "example.com MX": "hang" });

    const mx = checkOf(
      await scan("example.com", {}, { resolver: createDohResolver({ fetch: doh.fetch, queryTimeoutMs: 20 }) }),
      "mx",
    );

    expect(mx.result).toBe("inconclusive");
  });
});
