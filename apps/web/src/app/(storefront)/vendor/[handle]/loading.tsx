import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { ProductGridSkeleton } from "@/component/product/ProductGridSkeleton";

export default function VendorStoreLoading() {
  return (
    <CustomerLayout categories={[]}>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" aria-busy="true">
        <div className="mb-10 h-48 animate-pulse rounded-3xl bg-secondary" />
        <div className="mb-8 space-y-3">
          <div className="h-8 w-72 animate-pulse rounded bg-secondary" />
          <div className="h-5 w-96 max-w-full animate-pulse rounded bg-secondary" />
        </div>
        <ProductGridSkeleton count={8} />
      </div>
    </CustomerLayout>
  );
}
