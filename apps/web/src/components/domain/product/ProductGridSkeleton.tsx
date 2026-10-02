import { Card,CardContent,CardHeader } from "@/component/ui/card";

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="h-full border-0 shadow-none">
          <CardHeader className="p-0">
            <div className="aspect-square animate-pulse rounded-t-lg bg-muted" />
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted mb-2" />
            <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
