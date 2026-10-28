import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("The theme toggle", () => {
  it("switches the dark class on the root element", async () => {
    render(<App />);
    expect(document.documentElement).not.toHaveClass("dark");

    await userEvent.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(document.documentElement).toHaveClass("dark");

    await userEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("remembers the choice on the next visit", async () => {
    const firstVisit = render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    firstVisit.unmount();
    document.documentElement.classList.remove("dark");

    render(<App />);

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeInTheDocument();
  });

  it("still works when localStorage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /switch to dark mode/i }));

    expect(document.documentElement).toHaveClass("dark");
  });
});

describe("The page", () => {
  it("asks the hero question", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Can your domain be spoofed?" })).toBeInTheDocument();
  });

  it("gives every input and button an ARIA label", () => {
    render(<App />);

    const controls = [...screen.getAllByRole("textbox"), ...screen.getAllByRole("button")];
    expect(controls.length).toBeGreaterThanOrEqual(3);
    for (const control of controls) expect(control).toHaveAttribute("aria-label");
  });
});
