import type { CategoryResponseDto } from "@/api/dto/category";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { CategorySectionGrid } from "@/component/category/CategorySectionGrid";

export function CategoryLandingView({
  categories,
}: {
  categories: CategoryResponseDto[];
}) {
  const rootCategories = categories.filter(
    (category) => category.parentId === null && category.isActive,
  );

  return (
    <CustomerLayout categories={categories}>
      <main className="mx-auto min-h-[70svh] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Browse by category
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Find your next favorite
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Start with a category, then explore its sections and products.
          </p>
        </div>

        {rootCategories.length > 0 ? (
          <CategorySectionGrid categories={rootCategories} parentPath="/category" />
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Categories are being prepared. Please check back soon.
          </p>
        )}
      </main>
    </CustomerLayout>
  );
}
