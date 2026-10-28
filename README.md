# MailGuard

Scan a Domain for spoofing protection (SPF, DMARC, MX) and Blocklist listings. See [`PRD.md`](./PRD.md), [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr/).

## Layout

npm workspaces:

- `packages/shared`: the Scan API JSON types, shared by the Worker and the App (types only).
- `packages/worker`: the Cloudflare Worker serving `GET /api/scan?domain=…`.
  - `src/resolver.ts`: the Resolver interface (the only way to reach DNS); `src/doh-resolver.ts` is the production implementation (Cloudflare DoH).
  - `src/checks/`: one module per Check; `src/checks/index.ts` is the list of Checks a Scan runs.
- `packages/app`: the React single-page app (Vite + Tailwind).
  - `src/checks/`: how each Check is shown; `src/checks/index.tsx` maps each Check kind to its title, column and details component.

### Adding a Check

1. Add its type to `packages/shared/src/index.ts` and to the `Check` union.
2. Worker: add `src/checks/<name>.ts` implementing `CheckModule`, and list it in `src/checks/index.ts`.
3. App: add a details component in `src/checks/` and an entry in `checkViews`.

## Development

Requires Node 24.

```sh
npm install
npm run dev:worker   # Worker on http://localhost:8787 (wrangler dev)
npm run dev:app      # App on http://localhost:5173, proxies /api to the Worker
```

## Tests

```sh
npm test             # runs every workspace's tests (Worker + App)
npm run typecheck    # tsc for every workspace
```

Tests only go through two seams:

- **Worker**: `packages/worker/test/` sends real Requests to the fetch handler under `@cloudflare/vitest-plugin` (workerd). DNS is a scripted fake Resolver (`test/fake-resolver.ts`); `test/scan-helpers.ts` has `scan()` / `scanRequest()`.
- **App**: `packages/app/src/App.test.tsx` renders the whole App with React Testing Library (jsdom) and stubs `fetch` for `/api/scan` (`src/test/scan-api-stub.ts`).
