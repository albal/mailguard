export function ScanSkeleton() {
  return (
    <div role="status" aria-label="Scanning" className="animate-pulse space-y-6">
      <div className="h-28 border-4 border-gray-300 dark:border-gray-700" />
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column} className="space-y-4">
            <div className="h-6 w-40 bg-gray-300 dark:bg-gray-700" />
            <div className="h-32 border-2 border-gray-300 dark:border-gray-700" />
          </div>
        ))}
      </div>
    </div>
  );
}
