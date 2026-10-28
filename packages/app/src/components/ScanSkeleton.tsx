// Placeholder while a Scan runs: grey blocks in the palette's muted tone, with
// a red loading bar (PRD §4.1: red marks loading indicators).
export function ScanSkeleton() {
  return (
    <div role="status" aria-label="Scanning" className="space-y-6">
      <div className="h-1 w-full animate-pulse bg-accent" />
      <div className="animate-pulse space-y-6">
        <div className="h-28 border-4 border-muted/40" />
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1].map((column) => (
            <div key={column} className="space-y-4">
              <div className="h-6 w-40 bg-muted/40" />
              <div className="h-32 border-2 border-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
