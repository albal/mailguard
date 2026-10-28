# Product Requirements Document (PRD)

**Product Name:** MailGuard (Working Title)
**Document Version:** 1.1
**Date:** October 28, 2026
**Target Platform:** Web Application (Single Page)

Terms in **bold** are defined in [`GLOSSARY.md`](./GLOSSARY.md). Architectural decisions are recorded in [`docs/adr/`](./docs/adr/).

## 1. Product Overview

### 1.1 Purpose

MailGuard is a lightweight, fast single-page web application that **Scans** a **Domain** to evaluate how well it is protected against spoofing and whether it appears on any **Blocklist**. The user may enter an email address or a bare domain; only the Domain is assessed. MailGuard checks anti-spoofing DNS records (SPF, DMARC) and mail routing (MX), and looks up the Domain and its **Sending IPs** and **Receiving IPs** on Blocklists.

MailGuard assesses domain configuration, not individual mailboxes: `alice@example.com` and `bob@example.com` produce the same result.

### 1.2 Target Audience

* **Everyday Users:** Individuals wanting to know whether their email provider's domain is protected against spoofing.
* **IT Admins / Domain Owners:** Professionals verifying their own organization's email configuration and IP reputation.
* **Security Enthusiasts:** Users investigating whether the domain of a suspicious email address is spoofable, listed, or a lookalike.

## 2. Key Features & Functional Requirements

### 2.1 Input

* A single, prominent input accepting either `user@domain` or a bare `domain`.
* Frontend validation of syntax.
* The frontend strips the local part; **only the Domain is ever sent to the backend** ([ADR-0001](./docs/adr/0001-only-the-domain-leaves-the-browser.md)).
* Internationalised domains are accepted in Unicode and converted to Punycode in the browser. When the two forms differ, both are displayed, so lookalike domains are visible.
* If the Domain does not exist (NXDOMAIN), no Checks run and the user is told "This domain doesn't exist."

### 2.2 Checks

Every **Check** produces a **Check Result**: Pass, Warning, Fail or **Inconclusive**. Each Check has its own timeout; a Check that times out or receives a refused/error response is Inconclusive, never Pass or Fail.

**SPF** (TXT record on the Domain):

| Result  | Condition |
| ------- | --------- |
| Fail    | No SPF record; multiple SPF records; `+all`; permerror (syntax error or more than 10 DNS lookups, counted by following `include:`s) |
| Warning | `?all`, or no `all` mechanism |
| Pass    | `-all` or `~all` |

**DMARC** ([RFC 9989](https://www.rfc-editor.org/rfc/rfc9989.html)): `_dmarc.<Domain>` is checked first. If it has no DMARC record, the RFC 9989 DNS Tree Walk (§4.10) finds the **Organizational Domain** (at most 8 queries; names longer than 8 labels are shortened to 7 first; `psd=y`/`psd=n`/`psd=u` are honoured), and that domain's record, or failing that a `psd=y` record, supplies the policy. A record that doesn't begin with `v=DMARC1` is ignored, and a name with several DMARC records is treated as having none.

| Result  | Condition |
| ------- | --------- |
| Fail    | No applicable record after discovery; or an invalid `p`/`sp`/`np` with no syntactically valid `rua` URI (no DMARC processing applies) |
| Warning | The applicable policy is `none` (including a missing `p`, or an invalid `p`/`sp`/`np` with a valid `rua`, both treated as `p=none`), or test mode (`t=y`) |
| Pass    | The applicable policy is `quarantine` or `reject`, and `t` is not `y` |

The applicable policy is `p` when the record is the Domain's own. When the policy is inherited, `sp` takes precedence over `p` if present (`np` doesn't apply, because a Domain that doesn't exist is never Checked). Unknown tags, including the former `pct`, are ignored. The UI shows which domain the policy came from.

**MX**:

| Result  | Condition |
| ------- | --------- |
| Fail    | No MX and no A/AAAA; or MX hosts that don't resolve |
| Warning | No MX but an A/AAAA exists (implicit MX) |
| Pass    | MX hosts that resolve, or a Null MX (`MX 0 .`, RFC 7505: the domain deliberately receives no mail) |

**Blocklists** ([ADR-0002](./docs/adr/0002-spamhaus-via-dqs.md)):

* **Domain:** Spamhaus DBL (via DQS).
* **Sending IPs** (single `ip4:`/`ip6:` addresses in the SPF record; ranges and `include:`d providers are skipped) and **Receiving IPs** (MX host addresses): Spamhaus ZEN (via DQS), SpamCop, PSBL, Mailspike.
* Any listing is a Fail; the UI names the Blocklist and labels the IP's role (sending or receiving server).
* An IPv6 address against an IPv4-only Blocklist is *not applicable*: not run and not counted in the Verdict.
* The Blocklist set is defined in a single configuration file.

DKIM is out of scope for V1 (see §6).

### 2.3 Verdict

The **Verdict** is the worst Check Result across the Scan:

1. Any Fail: **High Risk**
2. Else any Warning: **At Risk**
3. Else any Inconclusive: **Incomplete**
4. Else: **Well Configured**

The word "Secure" is deliberately not used: passing every Check does not make a domain secure.

### 2.4 Results Dashboard

* Shows the Verdict, then each Check Result with a brief, human-readable explanation of what the Check means and why it got that result.
* Shows the time the Scan was performed (results may be served from cache; see §3.3).

### 2.5 User Experience (UX) Flow

1. User lands on the page.
2. User types an email address or domain into the central input and hits "Scan" or presses Enter.
3. A skeleton UI is shown while the Scan runs.
4. The complete result is rendered at once, grouped into "Security Protocols" (SPF, DMARC, MX) and "Reputation" (Blocklists).
5. User can toggle between Light and Dark mode at any time via a header switch.

## 3. Technical Architecture & Tech Stack

### 3.1 Infrastructure

* **Hosting:** Cloudflare Pages (frontend) and Cloudflare Workers (backend API).
* **DNS & Routing:** Cloudflare.

### 3.2 Frontend

* **Framework:** React (functional components, hooks).
* **Language:** TypeScript (strict mode).
* **State:** Plain `useState`; no state library or Context. The theme is a `dark` class on `<html>`, persisted in `localStorage`.
* **Styling:** Tailwind CSS.

### 3.3 Backend (Cloudflare Worker)

* **Language:** TypeScript.
* **API:** `GET /api/scan?domain=<punycode>` only. Returns a standardized JSON response with the parsed records, each Check Result, and the Verdict.
* Performs server-side validation of the Domain.
* Resolves DNS via Cloudflare DoH (`1.1.1.1`).
* Runs Checks concurrently, each with its own timeout, to stay within the performance budget.
* The Spamhaus DQS key is stored as a Worker secret.
* **Caching:** Scan results are cached per Domain at the edge (Workers Cache API) for 5 minutes.

## 4. UI/Design Specifications

### 4.1 Color Palette

A strict three-color palette (plus greys) conveys a technical, security-focused aesthetic. No green.

* **Black:** `#000000` to `#111111` (Dark Mode backgrounds, Light Mode text).
* **White:** `#FFFFFF` to `#F3F4F6` (Light Mode backgrounds, Dark Mode text).
* **Red:** `#E60000` or `#DC2626` (primary accent): the "Scan" button, loading indicators, Warnings and Fails.

Check Results are distinguished by icon and label, never by color alone:

| Check Result | Presentation |
| ------------ | ------------ |
| Pass         | Black/white text, ✓ |
| Warning      | Red outline, ! |
| Fail         | Solid red, ✕ |
| Inconclusive | Grey, ? |

### 4.2 Theming (Dark & Light Mode)

* **Light Mode:** White background, stark black text, heavy black borders for inputs/cards, red accents.
* **Dark Mode:** Deep black/charcoal background, crisp white text, white/gray borders. Red accents remain the same.
* **Toggle:** An icon in the top right corner (Sun/Moon or a simple switch) toggles `class="dark"` on the root HTML element.

### 4.3 Layout

* **Header:** Logo/Title left-aligned, Dark/Light toggle right-aligned.
* **Hero Section:** Large, bold typography, e.g. "Can your domain be spoofed?"
* **Input Section:** Centered, oversized input with a stark contrasting border and a solid Red "Scan" button.
* **Results Section:** Appears below the input after a Scan. Grid layout:
  * **Top:** Verdict and Scan time.
  * **Left Column:** Security Protocols (SPF, DMARC, MX).
  * **Right Column:** Reputation (checked against X Blocklists, Y listings).

## 5. Non-Functional Requirements

* **Performance:** The Worker returns a complete Scan in under 2.5 seconds; per-Check timeouts enforce this. Frontend bundle size must be kept minimal.
* **Security:**
  * Rate limiting via the Workers Rate Limiting binding: 10 Scans per minute per IP, cached or not.
  * CORS allows only the production Pages origin in production. Preview Workers additionally allow `*.mailguard.pages.dev`, configured via environment variable.
  * No email addresses reach the backend ([ADR-0001](./docs/adr/0001-only-the-domain-leaves-the-browser.md)).
* **Accessibility:** ARIA labels on all inputs and buttons. Check Results are conveyed by icon and text, not color alone. The Black/White/Red palette meets WCAG AA contrast.
* **Responsiveness:** Mobile-first; the grid collapses to a single column under 768px width.

## 6. Future Considerations (V2)

* **DKIM Checking:** Requires knowing the selector, so it can't be checked reliably from a Domain alone. V2 could let users send an email to a generated address so MailGuard can parse the DKIM signature. (Probing common selectors was rejected: a miss is not evidence of absence.)
* **Export/Report:** Download a PDF report of a Scan.
* **Continuous Monitoring:** Subscribe to be alerted if a Domain appears on a Blocklist.
