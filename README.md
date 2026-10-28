# MailGuard

Scan a Domain for spoofing protection (SPF, DMARC, MX) and Blocklist listings. See [`PRD.md`](./PRD.md), [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr/).

## Layout

npm workspaces:

- `packages/shared`: the Scan API JSON types, shared by the Worker and the App, plus the few constants both must agree on (e.g. `SPF_LOOKUP_LIMIT`).
- `packages/worker`: the Cloudflare Worker serving `GET /api/scan?domain=…`.
  - `src/resolver.ts`: the Resolver interface (the only way to reach DNS); `src/doh-resolver.ts` is the production implementation (Cloudflare DoH).
  - `src/checks/`: one module per Check; `src/checks/index.ts` is the list of Checks a Scan runs.
  - `src/blocklists.ts`: the single Blocklist configuration. Add a Blocklist by adding an entry; DQS entries need the `SPAMHAUS_DQS_KEY` secret.
- `packages/app`: the React single-page app (Vite + Tailwind).
  - `src/checks/`: how each Check is shown; `src/checks/index.tsx` maps each Check kind to its title, column and details component.

### Adding a Check

1. Add its type to `packages/shared/src/index.ts` and to the `Check` union.
2. Worker: add `src/checks/<name>.ts` implementing `CheckModule` (build its results with `reporter()` from `check-module.ts`), and list it in `src/checks/index.ts`.
3. App: add a details component in `src/checks/` and an entry in `checkViews`.

## Development

Requires Node 24.

```sh
npm install
npm run dev:worker   # Worker on http://localhost:8787 (wrangler dev)
npm run dev:app      # App on http://localhost:5173, proxies /api to the Worker
```

### Spamhaus DQS key (`SPAMHAUS_DQS_KEY`)

Spamhaus ZEN and DBL are queried through DQS (ADR-0002), which needs a free DQS query key from Spamhaus. The key is a Worker secret: it stays in the Worker and never appears in a Scan response or in this repo. Without it, every Spamhaus lookup is Inconclusive, so no Scan can reach a Verdict better than Incomplete.

- Local development: put it in `packages/worker/.dev.vars` (git-ignored), which `wrangler dev` reads:

  ```sh
  echo 'SPAMHAUS_DQS_KEY=<your-key>' > packages/worker/.dev.vars
  ```

- Production: `cd packages/worker && npx wrangler secret put SPAMHAUS_DQS_KEY` (add `--env preview` for the preview Worker).

Tests never use a real key: `test/scan-helpers.ts` sets a dummy one.

## Deploy

One Worker (`mailguard`) serves both the App, as static assets from `packages/app/dist`, and the Scan API under `/api/` (see `assets` in `packages/worker/wrangler.jsonc`). Cloudflare Workers Builds settings, with the root directory at the repo root:

- **Build command:** `npm ci && npm run build -w packages/app`
- **Deploy command:** `npx wrangler deploy -c packages/worker/wrangler.jsonc`
- **Runtime secret:** `SPAMHAUS_DQS_KEY` (Worker → Settings → Variables and Secrets, not the build variables)
- **Custom domain:** required, because the Cache API is a no-op on `*.workers.dev`.

## Tests

```sh
npm test             # runs every workspace's tests (Worker + App)
npm run typecheck    # tsc for every workspace
```

Tests only go through two seams:

- **Worker**: `packages/worker/test/` sends real Requests to the fetch handler under `@cloudflare/vitest-plugin` (workerd). DNS is a scripted fake Resolver (`test/fake-resolver.ts`); `test/scan-helpers.ts` has `scan()` / `scanRequest()`. The suite runs as two vitest projects, one per `wrangler.jsonc` environment: `test/preview/` runs against the `preview` environment's bindings and vars, everything else against production's.
- **App**: `packages/app/src/App.test.tsx` renders the whole App with React Testing Library (jsdom) and stubs `fetch` for `/api/scan` (`src/test/scan-api-stub.ts`).
