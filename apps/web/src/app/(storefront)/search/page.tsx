import { serverGetCategories, serverGetProducts } from "@/api/server";
import { ProductCatalogView } from "@/component/product/ProductCatalogView";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { GlobalSearchBar } from "@/component/search/GlobalSearchBar";
import Link from "@/components/navigation/AppLink";
import { findCategoryFullPath } from "@/lib/cart-path";
import { Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search | NUTS-P Marketplace",
  description: "Search products from independent vendors across Nigeria.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, categories] = await Promise.all([
    searchParams,
    serverGetCategories(),
  ]);
  const search = q?.trim().slice(0, 100) ?? "";

  if (!search) {
    const popularCategories = categories.slice(0, 8);
    return (
      <CustomerLayout categories={categories}>
        <main className="mx-auto flex min-h-[60svh] max-w-5xl flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Search className="h-7 w-7" />
          </div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Explore the marketplace
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            What are you looking for?
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Search products from independent vendors, or start with a popular category.
          </p>
          <div className="mt-8 w-full">
            <GlobalSearchBar
              variant="hero"
              categories={categories}
              placeholder="Try “handmade bag” or “home decor”"
            />
          </div>
          {popularCategories.length > 0 && (
            <div className="mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
              {popularCategories.map((category) => (
                <Link
                  key={category.id}
                  href={
                    findCategoryFullPath(category.slug, categories) ||
                    `/category/${category.slug}`
                  }
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          )}
        </main>
      </CustomerLayout>
    );
  }

  const productsResult = await serverGetProducts({
    limit: 24,
    page: 1,
    search,
    sort: "newest",
  });

  return (
    <ProductCatalogView
      initialCategories={categories}
      initialProducts={productsResult.data}
      initialMeta={productsResult.meta ?? undefined}
      initialFilters={{ search, sort: "newest" }}
      searchPage
    />
  );
}
