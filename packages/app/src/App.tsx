import type { NonexistentDomain, Scan } from "@mailguard/shared";
import { useState, type FormEvent } from "react";
import { ScanResults } from "./components/ScanResults";
import { ScanSkeleton } from "./components/ScanSkeleton";
import { ThemeToggle } from "./components/ThemeToggle";
import { displayDomain, toDomain } from "./domain";
import { fetchScan, RateLimitedError } from "./scan-api";

type ScanState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "done"; scan: Scan }
  | { phase: "nonexistent"; response: NonexistentDomain }
  | { phase: "failed" }
  | { phase: "rate-limited" };

export function App() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<ScanState>({ phase: "idle" });
  const [inputError, setInputError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = toDomain(input);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    setState({ phase: "scanning" });
    try {
      const response = await fetchScan(parsed.domain);
      setState("exists" in response ? { phase: "nonexistent", response } : { phase: "done", scan: response });
    } catch (error) {
      setState({ phase: error instanceof RateLimitedError ? "rate-limited" : "failed" });
    }
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-xl font-black tracking-tight">
          Mail<span className="text-accent-text">Guard</span>
        </span>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-4 pb-16">
        <section className="space-y-8 pt-10 text-center sm:pt-20">
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Can your domain be spoofed?</h1>
          <form onSubmit={onSubmit} className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row">
            <input
              type="text"
              aria-label="Email address or domain"
              placeholder="you@example.com"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError ? "domain-input-error" : undefined}
              className="min-w-0 flex-1 border-4 border-ink bg-page px-5 py-4 text-xl text-ink placeholder:text-muted sm:text-2xl"
            />
            <button
              type="submit"
              aria-label="Scan"
              className="bg-accent px-10 py-4 text-xl font-black uppercase tracking-wide text-white hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60 sm:text-2xl"
              disabled={state.phase === "scanning"}
            >
              Scan
            </button>
          </form>
          {inputError && (
            <p id="domain-input-error" className="font-bold text-accent-text">
              {inputError}
            </p>
          )}
        </section>

        {state.phase === "scanning" && <ScanSkeleton />}
        {state.phase === "done" && <ScanResults scan={state.scan} />}
        {state.phase === "nonexistent" && (
          <section aria-label="Domain not found" className="border-4 border-ink p-6">
            <p className="text-4xl font-black">This domain doesn't exist</p>
            <p className="text-sm text-muted">
              DNS has no record of {displayDomain(state.response.domain)}. Check the spelling and try again.
            </p>
          </section>
        )}
        {state.phase === "failed" && (
          <p role="alert" className="border-2 border-accent-text p-4 font-bold text-accent-text">
            The Scan couldn't be completed. Please try again.
          </p>
        )}
        {state.phase === "rate-limited" && (
          <p role="alert" className="border-2 border-accent-text p-4 font-bold text-accent-text">
            You've run a lot of Scans in the last minute. Please wait a moment, then try again.
          </p>
        )}
      </main>
    </div>
  );
}
