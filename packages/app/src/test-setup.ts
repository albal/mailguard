import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest globals are off, so RTL's auto-cleanup doesn't register itself.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
