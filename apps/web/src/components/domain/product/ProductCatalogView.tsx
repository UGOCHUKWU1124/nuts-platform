"use client";

import { productService } from "@/api";
import type { CategoryResponseDto } from "@/api/dto/category";
import type { PaginationMeta, CursorPaginationMeta } from "@/api/core/types";
import type { ProductCardDto } from "@/api/dto/product";
import type { VendorResponseDto } from "@/api/dto/vendor";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { ProductCard } from "@/component/product/ProductCard";
import { ProductGridSkeleton } from "@/component/product/ProductGridSkeleton";
import { RemoteImage } from "@/component/ui/RemoteImage";
import { Button } from "@/component/ui/button";
import { Input } from "@/component/ui/input";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CategoryFilterDrawer } from "@/component/category/CategoryFilterDrawer";
import { Loader2, Search, SlidersHorizontal, Store, X } from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useEffect, useRef, useState } from "react";

const EMPTY_CATEGORIES: CategoryResponseDto[] = [];

// Lightweight pseudo-random shuffle to provide a dynamic assortment on session load
function shuffleProducts(items: ProductCardDto[]): ProductCardDto[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i]!;
    array[i] = array[j]!;
    array[j] = temp;
  }
  return array;
}

export interface ProductCatalogViewProps {
  initialCategories: CategoryResponseDto[];
  initialProducts: ProductCardDto[];
  initialMeta?: PaginationMeta | CursorPaginationMeta;
  initialVendors?: VendorResponseDto[];
  searchPage?: boolean;
  initialFilters?: {
    search?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
    inStock?: boolean;
  };
}

export function ProductCatalogView({
  initialCategories,
  initialProducts,
  initialVendors = [],
  searchPage = false,
  initialFilters,
}: ProductCatalogViewProps) {
  const [searchInput, setSearchInput] = useState(initialFilters?.search || "");
  const search = useDebouncedValue(searchInput.trim().toLowerCase(), 300);
  const [inStock, setInStock] = useState(Boolean(initialFilters?.inStock));
  const [minPrice, setMinPrice] = useState(initialFilters?.minPrice || "");
  const [maxPrice, setMaxPrice] = useState(initialFilters?.maxPrice || "");
  const [sortBy, setSortBy] = useState(initialFilters?.sort || "newest");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const allCategories = initialCategories ?? EMPTY_CATEGORIES;
  const minPriceValue = minPrice.trim() ? Number(minPrice) : undefined;
  const maxPriceValue = maxPrice.trim() ? Number(maxPrice) : undefined;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      "product-catalog-infinite",
      search,
      inStock,
      minPrice,
      maxPrice,
      sortBy,
    ],
    queryFn: async ({ pageParam = 1, signal }) => {
      const res = await productService.getCards(
        {
          page: pageParam,
          limit: 24,
          search: search || undefined,
          minPrice: Number.isFinite(minPriceValue) ? minPriceValue : undefined,
          maxPrice: Number.isFinite(maxPriceValue) ? maxPriceValue : undefined,
          inStock: inStock || undefined,
          sort: sortBy,
        },
        signal,
      );
      return res.data ?? [];
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < 24) return undefined;
      return allPages.length + 1;
    },
    initialData:
      !search && !inStock && !minPrice && !maxPrice && sortBy === "newest"
        ? {
            pages: [searchPage ? initialProducts : shuffleProducts(initialProducts)],
            pageParams: [1],
          }
        : undefined,
  });

  const rawProducts = data?.pages ? data.pages.flat() : initialProducts;

  // Auto-load next page when user scrolls near the bottom of the feed
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "350px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleResetFilters = () => {
    setMinPrice("");
    setMaxPrice("");
    setInStock(false);
    setSortBy("newest");
    setSearchInput("");
  };

  const hasActiveFilters = Boolean(
    search || inStock || minPrice || maxPrice || sortBy !== "newest"
  );

  return (
    <CustomerLayout categories={allCategories}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Banner */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 border-b border-neutral-200/80 dark:border-neutral-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-black dark:text-white">
              {searchPage
                ? search
                  ? `Results for “${searchInput.trim()}”`
                  : "Search the marketplace"
                : "Explore Marketplace"}
            </h1>
            {searchPage && (
              <p className="mt-2 text-xs sm:text-sm text-neutral-500">
                Browse verified vendors and curated products matching your query.
              </p>
            )}
          </div>

          {/* Quick Search & Filters Controls */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search products..."
                className="h-10 rounded-full border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 pl-10 pr-9 text-sm focus:bg-white dark:focus:bg-black"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFilterDrawerOpen(true)}
              className="h-10 shrink-0 rounded-full border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-4 text-xs sm:text-sm font-semibold text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="h-1.5 w-1.5 rounded-full bg-black dark:bg-white" />
              )}
            </Button>
          </div>
        </div>

        {/* Matching Verified Stores Header on Search */}
        {searchPage && initialVendors.length > 0 && (
          <div className="mb-10 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60 p-5">
            <div className="flex items-center gap-2 mb-3.5">
              <Store className="h-4 w-4 text-black dark:text-white" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-black dark:text-white">
                Matching Verified Stores
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {initialVendors.map((vendor) => (
                <Link
                  key={vendor.storeSlug}
                  href={`/vendor/${vendor.storeSlug}`}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-black rounded-xl border border-neutral-200/80 dark:border-neutral-800 hover:border-black dark:hover:border-white transition-all shadow-2xs group"
                >
                  <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                    {vendor.storeLogoUrl ? (
                      <RemoteImage
                        src={vendor.storeLogoUrl}
                        alt={vendor.storeName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      vendor.storeName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-black dark:text-white truncate group-hover:underline">
                      {vendor.storeName}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {vendor.storeDescription || "Verified Merchant"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-400 mr-1">Active filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-xs font-semibold text-black dark:text-white">
                &ldquo;{searchInput}&rdquo;
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="hover:opacity-75"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {inStock && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-xs font-semibold text-black dark:text-white">
                In Stock Only
                <button
                  type="button"
                  onClick={() => setInStock(false)}
                  className="hover:opacity-75"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {(minPrice || maxPrice) && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-xs font-semibold text-black dark:text-white">
                ₦{minPrice || "0"} – ₦{maxPrice || "Any"}
                <button
                  type="button"
                  onClick={() => {
                    setMinPrice("");
                    setMaxPrice("");
                  }}
                  className="hover:opacity-75"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-black dark:text-white underline ml-2 cursor-pointer"
            >
              Reset all
            </button>
          </div>
        )}

        {/* Product Catalog Display */}
        {isError && rawProducts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-800 py-16 text-center">
            <p className="text-sm text-destructive">Products could not be loaded.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="mt-4 rounded-full"
            >
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <div className="py-6">
            <ProductGridSkeleton count={8} />
          </div>
        ) : rawProducts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-800 py-20 text-center">
            <Search className="mx-auto h-10 w-10 text-neutral-400" />
            <h3 className="mt-4 text-base font-bold text-black dark:text-white">
              {searchPage && search
                ? `No products match “${searchInput.trim()}”`
                : "No products available in this feed"}
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-neutral-500">
              Try adjusting your search keywords or resetting filters.
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="mt-4 rounded-full"
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            {/* Unified Randomized Products Grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 sm:gap-x-6 sm:gap-y-10">
              {rawProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* Automatic Continuous Scroll Sentinel & Loading Indicator */}
            <div
              ref={loadMoreSentinelRef}
              className="flex justify-center items-center py-8 min-h-[4rem]"
            >
              {isFetchingNextPage ? (
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-neutral-500 animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
                  <span>Loading products...</span>
                </div>
              ) : hasNextPage ? (
                <div className="h-6" aria-hidden="true" />
              ) : rawProducts.length > 0 ? (
                <p className="text-xs text-neutral-400">All products loaded</p>
              ) : null}
            </div>
          </div>
        )}

        {/* Slide-over Filter Drawer */}
        <CategoryFilterDrawer
          isOpen={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinPriceChange={(val) => setMinPrice(val)}
          onMaxPriceChange={(val) => setMaxPrice(val)}
          inStock={inStock}
          onInStockChange={(val) => setInStock(val)}
          sortBy={sortBy}
          onSortByChange={(val) => setSortBy(val)}
          onReset={handleResetFilters}
        />
      </div>
    </CustomerLayout>
  );
}
