# Query Spamhaus via DQS, and only resolver-friendly Blocklists

The Worker resolves DNS through Cloudflare DoH (`1.1.1.1`), a public resolver. Spamhaus refuses public-resolver queries on its public zones (returns `127.255.255.254`), so we query ZEN and DBL through Spamhaus DQS with a free key held as a Worker secret. DBL via DQS is our only domain-name Blocklist.

## Considered Options

Tested against `1.1.1.1` on 2026-10-28:

- **SpamCop, PSBL, Mailspike**: work; adopted for IP checks.
- **SURBL** (SERVFAIL) and **URIBL** (returns its blocked-resolver code `127.0.0.1`): unusable from a public resolver.
- **Barracuda**: answers, but its terms require registering the querying resolver, which we can't do on a shared one.
- **UCEPROTECT**: answers, but rejected over its paid-delisting model.
- **SORBS**: shut down in 2024 (NXDOMAIN).
