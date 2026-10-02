export function GoingNutsSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-lg" />
        <div className="flex items-center gap-1.5">
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        </div>
      </div>

      <div className="flex gap-4 sm:gap-6 overflow-hidden pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="w-[230px] sm:w-[270px] shrink-0 space-y-3"
          >
            <div className="aspect-[4/5] w-full rounded-2xl bg-muted animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
