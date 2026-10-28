import type { RecordType, ResolveOutcome, Resolver } from "../src/resolver";

/** What the fake returns for one name and record type. `hang` never settles. */
export type ScriptedAnswer = string[] | "nxdomain" | "error" | "timeout" | "hang";

/**
 * DNS as a test declares it: name → record type → answer, or a whole name as
 * `"nxdomain"`. Anything unscripted is NODATA (no answers).
 */
export type DnsScript = Record<string, Partial<Record<RecordType, ScriptedAnswer>> | "nxdomain">;

export function fakeResolver(script: DnsScript): Resolver & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async resolve(name: string, type: RecordType): Promise<ResolveOutcome> {
      queries.push(`${name} ${type}`);
      const entry = script[name];
      if (entry === "nxdomain") return { kind: "nxdomain" };
      const answer = entry?.[type] ?? [];
      if (answer === "hang") return new Promise<never>(() => {});
      if (typeof answer === "string") return { kind: answer };
      return { kind: "answers", answers: answer };
    },
  };
}
