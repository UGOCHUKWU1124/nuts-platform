export default function Loading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading page">
      <div className="h-16 border-b border-border/70 bg-background/95" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-3">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-secondary" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-secondary/80" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="space-y-3">
              <div className="aspect-[3/4] animate-pulse rounded-2xl bg-secondary" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-2/5 animate-pulse rounded bg-secondary/80" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
