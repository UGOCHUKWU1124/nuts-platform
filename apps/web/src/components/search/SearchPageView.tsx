"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import { productService,publicVendorService } from "@/api";
import type { CategoryResponseDto } from "@/api/dto/category";
import type { ProductCardDto } from "@/api/dto/product";
import type { VendorResponseDto } from "@/api/dto/vendor";
import { PageHeader } from "@/component/common/PageHeader";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { ProductCard } from "@/component/product/ProductCard";
import { ProductGridSkeleton } from "@/component/product/ProductGridSkeleton";
import { Button } from "@/component/ui/button";
import { Input } from "@/component/ui/input";
import { findCategoryFullPath } from "@/lib/cart-path";
import { queryKey } from "@/lib/query-key";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight,Search as SearchIcon,Sparkles,Store,Tag } from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useState } from "react";
import type { PaginationMeta } from "@/api/core/types";

interface SearchPageViewProps {
  categories: CategoryResponseDto[];
  initialQuery: string;
  initialProducts: ProductCardDto[];
  initialProductMeta: PaginationMeta | null;
  initialVendors: VendorResponseDto[];
}

export function SearchPageView({
  categories = [],
  initialQuery,
  initialProducts,
  initialProductMeta,
  initialVendors,
}: SearchPageViewProps) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [page, setPage] = useState(1);

  // 1. Products search
  const {
    data,
    isLoading,
    isPlaceholderData,
    isError,
  } = useQuery({
    queryKey: queryKey.product.list({ page, limit: 12, search: debouncedQuery }),
    queryFn: async ({ signal }) =>
      productService.getCards({
        page,
        limit: 12,
        search: debouncedQuery,
      }, signal),
    initialData: debouncedQuery === initialQuery.trim() && debouncedQuery.length >= 2 && initialProductMeta != null
      ? { data: initialProducts, meta: initialProductMeta }
      : undefined,
    placeholderData: (previousData) => previousData,
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  // 2. Vendors search
  const { data: matchedVendors } = useQuery({
    queryKey: queryKey.vendor.list({ search: debouncedQuery }),
    queryFn: async ({ signal }) => {
      const { data } = await publicVendorService.list({
        search: debouncedQuery,
        limit: 4,
      }, signal);
      return data;
    },
    initialData:
      debouncedQuery === initialQuery.trim() && debouncedQuery.length >= 2 && initialVendors.length > 0
        ? initialVendors
        : undefined,
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60 * 10,
  });

  // 3. Categories matched instantly from RSC props — ZERO network overhead
  const categoriesList = categories;
  const matchingCategories: CategoryResponseDto[] = categoriesList
    .filter(
      (c: CategoryResponseDto) =>
        query.trim() &&
        (c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          c.slug.toLowerCase().includes(query.trim().toLowerCase()))
    )
    .slice(0, 6);

  const handleSearch = (q: string) => {
    setQuery(q);
    setPage(1);
    const url = new URL(window.location.href);
    if (q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const vendors = matchedVendors || [];
  const products = data?.data ?? [];
  const pageMeta = data?.meta && "page" in data.meta ? data.meta : undefined;
  const hasAnyResults =
    products.length > 0 || vendors.length > 0 || matchingCategories.length > 0;

  return (
    <CustomerLayout categories={categories}>
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
        <PageHeader
          title="Marketplace Search"
          description="Find products, categories, and verified vendors across Nigeria"
        />

        <div className="relative mt-6 max-w-2xl">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            className="h-12 pl-11 rounded-2xl border-border/80 bg-card text-sm shadow-xs focus:ring-2 focus:ring-primary/20"
            placeholder="Search products, categories, vendors..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {!query && !isError && (
          <div className="mt-12 rounded-3xl border border-dashed border-border/70 p-12 text-center max-w-lg mx-auto">
            <Sparkles className="mx-auto h-10 w-10 text-primary/40" />
            <h3 className="mt-3 text-base font-bold text-foreground">
              Search the NUTS Marketplace
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Type product names, categories like &quot;Fashion&quot; or &quot;Sneakers&quot;, or independent vendor names.
            </p>
          </div>
        )}

        {query && isError && (
          <p className="mt-8 text-sm text-destructive">
            Failed to load search results. Please try again.
          </p>
        )}

        {query && (
          <div className="mt-8 space-y-10">
            {/* Matched Categories */}
            {matchingCategories.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-primary">
                  <Tag className="h-4 w-4" />
                  Matching Categories
                </div>
                <div className="flex flex-wrap gap-2">
                  {matchingCategories.map((cat) => {
                    const fullHref =
                      findCategoryFullPath(cat.slug, categoriesList) || `/category/${cat.slug}`;
                    return (
                      <Link
                        key={cat.id || cat.slug}
                        href={fullHref}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-secondary/50 px-3.5 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all"
                      >
                        <span>{cat.name}</span>
                        <ArrowRight className="h-3 w-3 opacity-60" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Matched Vendors / Stores */}
            {vendors.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-wider text-primary">
                  <Store className="h-4 w-4" />
                  Verified Vendors &amp; Stores
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {vendors.map((c: VendorResponseDto) => {
                    const logo = c.storeLogoUrl;
                    return (
                      <Link
                        key={c.storeSlug}
                        href={`/vendor/${c.storeSlug}`}
                        className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3 hover:border-primary/40 hover:bg-secondary/60 transition-all"
                      >
                        <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center font-bold text-sm text-primary">
                          {logo ? (
                            <RemoteImage
                              src={logo}
                              alt={c.storeName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            c.storeName[0]
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {c.storeName}
                          </p>
                          <p className="text-xs text-primary font-medium">
                            Visit store →
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Products Grid */}
            <div>
              {isLoading || isPlaceholderData ? (
                <ProductGridSkeleton count={8} />
              ) : !hasAnyResults ? (
                <div className="rounded-3xl border border-dashed border-border/70 p-12 text-center">
                  <p className="text-muted-foreground">
                    No products, categories, or vendors found matching &quot;{query}&quot;.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-4">
                    Found {pageMeta?.totalItems ?? products.length} product(s) for &quot;{query}&quot;
                  </p>
                  {products.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 sm:gap-x-6 sm:gap-y-10">
                      {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  )}

                  {pageMeta && pageMeta.totalPages > 1 && (
                    <div className="mt-10 flex justify-center items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!pageMeta.hasPreviousPage}
                        onClick={() => setPage((p) => p - 1)}
                        className="rounded-xl"
                      >
                        Previous
                      </Button>
                      <span className="text-xs font-medium text-muted-foreground px-2">
                        Page {pageMeta.page} of {pageMeta.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!pageMeta.hasNextPage}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-xl"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
