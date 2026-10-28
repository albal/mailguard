import type { Scan } from "@mailguard/shared";
import { useState, type FormEvent } from "react";
import { ScanResults } from "./components/ScanResults";
import { ScanSkeleton } from "./components/ScanSkeleton";
import { ThemeToggle } from "./components/ThemeToggle";
import { toDomain } from "./domain";
import { fetchScan } from "./scan-api";

type ScanState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "done"; scan: Scan }
  | { phase: "failed" };

export function App() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<ScanState>({ phase: "idle" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setState({ phase: "scanning" });
    try {
      setState({ phase: "done", scan: await fetchScan(toDomain(input)) });
    } catch {
      setState({ phase: "failed" });
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
        </section>

        {state.phase === "scanning" && <ScanSkeleton />}
        {state.phase === "done" && <ScanResults scan={state.scan} />}
        {state.phase === "failed" && (
          <p role="alert" className="border-2 border-accent-text p-4 font-bold text-accent-text">
            The Scan couldn't be completed. Please try again.
          </p>
        )}
      </main>
    </div>
  );
}
