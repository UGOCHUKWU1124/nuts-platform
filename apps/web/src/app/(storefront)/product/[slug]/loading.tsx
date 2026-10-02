import { CustomerLayout } from "@/component/layout/CustomerLayout";

export default function ProductDetailLoading() {
  return (
    <CustomerLayout categories={[]}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" aria-busy="true">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-3xl bg-secondary" />
          <div className="space-y-6 py-4">
            <div className="h-9 w-3/4 animate-pulse rounded bg-secondary" />
            <div className="h-6 w-1/3 animate-pulse rounded bg-secondary" />
            <div className="h-24 w-full animate-pulse rounded-xl bg-secondary" />
            <div className="h-12 w-full animate-pulse rounded-xl bg-secondary" />
            <div className="h-14 w-full animate-pulse rounded-xl bg-secondary" />
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
