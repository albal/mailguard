import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

const configPath = "./wrangler.jsonc";

// Two projects, one per wrangler.jsonc environment, so tests see the real
// bindings and vars each environment deploys with. Tests under test/preview/
// run against the `preview` environment; everything else against production.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath } })],
        test: { name: "production", exclude: [...configDefaults.exclude, "test/preview/**"] },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath, environment: "preview" } })],
        test: { name: "preview", include: ["test/preview/**/*.test.ts"] },
      },
    ],
  },
});
