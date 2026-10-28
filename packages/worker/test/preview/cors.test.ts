import { describe, expect, it } from "vitest";
import { allowOriginFor } from "../scan-helpers";

// Runs in the `preview` vitest project: ALLOWED_ORIGINS is the value the
// `preview` environment in wrangler.jsonc deploys with.

describe("CORS (preview configuration)", () => {
  it("allows the production Pages origin", async () => {
    expect(await allowOriginFor("https://mailguard.pages.dev", { domain: "cors-preview-prod.test" })).toBe(
      "https://mailguard.pages.dev",
    );
  });

  it("allows Pages branch previews", async () => {
    const preview = "https://feature-x.mailguard.pages.dev";

    expect(await allowOriginFor(preview, { domain: "cors-preview.test" })).toBe(preview);
  });

  it("sends no allow header to lookalikes and other origins", async () => {
    for (const origin of [
      "https://evil.example",
      "https://mailguard.pages.dev.evil.example",
      "https://evilmailguard.pages.dev",
      "http://feature-x.mailguard.pages.dev",
    ]) {
      expect(await allowOriginFor(origin, { domain: "cors-preview-deny.test" }), origin).toBeNull();
    }
  });
});
