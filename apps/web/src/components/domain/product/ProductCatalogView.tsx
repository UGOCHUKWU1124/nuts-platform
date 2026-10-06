"use client";

import { productService } from "@/api";
import type { CategoryResponseDto } from "@/api/dto/category";
import type { PaginationMeta, CursorPaginationMeta } from "@/api/core/types";
import type { ProductCardDto } from "@/api/dto/product";
import { CategoryFilterDrawer } from "@/component/category/CategoryFilterDrawer";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { ProductCard } from "@/component/product/ProductCard";
import { ProductGridSkeleton } from "@/component/product/ProductGridSkeleton";
import { Button } from "@/component/ui/button";
import { Input } from "@/component/ui/input";
import { useQuery } from "@tanstack/react-query";
import { queryKey } from "@/lib/query-key";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Search,ShoppingBag,SlidersHorizontal,X } from "lucide-react";
import { useMemo,useRef,useState } from "react";

const EMPTY_CATEGORIES: CategoryResponseDto[] = [];
const EMPTY_PRODUCTS: ProductCardDto[] = [];

interface SubcategoryGroup {
  id: string;
  name: string;
  slug: string;
  products: ProductCardDto[];
}

export interface ProductCatalogViewProps {
  initialCategories: CategoryResponseDto[];
  initialProducts: ProductCardDto[];
  initialMeta?: PaginationMeta | CursorPaginationMeta;
  initialFilters?: {
    categoryId?: string;
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
  initialMeta,
  initialFilters,
}: ProductCatalogViewProps) {
  const [searchInput, setSearchInput] = useState(initialFilters?.search || "");
  const search = useDebouncedValue(searchInput.trim().toLowerCase(), 300);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialFilters?.categoryId || "");
  const [inStock, setInStock] = useState(Boolean(initialFilters?.inStock));
  const [minPrice, setMinPrice] = useState(initialFilters?.minPrice || "");
  const [maxPrice, setMaxPrice] = useState(initialFilters?.maxPrice || "");
  const [sortBy, setSortBy] = useState(initialFilters?.sort || "newest");
  const [pageState, setPageState] = useState({ filterKey: "", page: 1 });
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const allCategories = initialCategories ?? EMPTY_CATEGORIES;
  const rootCategories = allCategories.filter(
    (c) => !c.parentId
  );

  const selectedCategory = rootCategories.find(
    (c) => c.id === selectedCategoryId || c.slug === selectedCategoryId
  );

  // Flattened Category Map for fast category/subcategory resolution
  const categoryMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; slug: string; parentId?: string | null }>();
    function traverse(nodes: CategoryResponseDto[]) {
      for (const node of nodes) {
        if (node.id && node.name) {
          map.set(node.id, { id: node.id, name: node.name, slug: node.slug || node.id, parentId: node.parentId });
        }
        if (node.slug && node.name) {
          map.set(node.slug, { id: node.id || node.slug, name: node.name, slug: node.slug, parentId: node.parentId });
        }
        const children = node.children || node.subCategories || [];
        if (Array.isArray(children) && children.length > 0) {
          traverse(children);
        }
      }
    }
    traverse(allCategories);
    return map;
  }, [allCategories]);

  const filterKey = JSON.stringify([
    search,
    selectedCategoryId,
    inStock,
    minPrice,
    maxPrice,
    sortBy,
  ]);
  const page = pageState.filterKey === filterKey ? pageState.page : 1;
  const minPriceValue = minPrice.trim() ? Number(minPrice) : undefined;
  const maxPriceValue = maxPrice.trim() ? Number(maxPrice) : undefined;

  const productQuery = useQuery({
    queryKey: queryKey.product.list({
      page,
      limit: 24,
      categoryId: selectedCategoryId || undefined,
      search,
      minPrice: Number.isFinite(minPriceValue) ? minPriceValue : undefined,
      maxPrice: Number.isFinite(maxPriceValue) ? maxPriceValue : undefined,
      inStock,
      sort: sortBy,
    }),
    queryFn: async ({ signal }) =>
      productService.getCards({
        page,
        limit: 24,
        categoryId: selectedCategoryId || undefined,
        search: search || undefined,
        minPrice: Number.isFinite(minPriceValue) ? minPriceValue : undefined,
        maxPrice: Number.isFinite(maxPriceValue) ? maxPriceValue : undefined,
        inStock: inStock || undefined,
        sort: sortBy,
      }, signal),
    initialData:
      page === 1 &&
      search === (initialFilters?.search || "").trim().toLowerCase() &&
      selectedCategoryId === (initialFilters?.categoryId || "") &&
      inStock === Boolean(initialFilters?.inStock) &&
      minPrice === (initialFilters?.minPrice || "") &&
      maxPrice === (initialFilters?.maxPrice || "") &&
      sortBy === (initialFilters?.sort || "newest")
        ? {
            data: initialProducts,
            meta: initialMeta && "page" in initialMeta ? initialMeta : undefined,
          }
        : undefined,
  });
  const rawProducts = productQuery.data?.data ?? EMPTY_PRODUCTS;
  const isClientLoading = productQuery.isLoading;
  const pagination =
    productQuery.data?.meta && "page" in productQuery.data.meta
      ? productQuery.data.meta
      : null;

  // Group products into subcategory / category sections
  const subcategoryGroups: SubcategoryGroup[] = useMemo(() => {
    if (!rawProducts.length) return [];

    const groupMap = new Map<string, SubcategoryGroup>();

    for (const product of rawProducts) {
      let groupKey = "";
      let groupName = "";
      let groupSlug = "";

      // If user selected a specific root category, group by its subcategories
      if (selectedCategoryId) {
        if (product.subcategory?.name) {
          groupKey = product.subcategory.id;
          groupName = product.subcategory.name;
          groupSlug = product.subcategory.slug || product.subcategory.id;
        } else if (product.parentSubcategory?.name) {
          groupKey = product.parentSubcategory.id;
          groupName = product.parentSubcategory.name;
          groupSlug = product.parentSubcategory.slug || product.parentSubcategory.id;
        } else if (product.category?.name) {
          groupKey = product.category.id;
          groupName = product.category.name;
          groupSlug = product.category.slug || product.category.id;
        } else {
          groupKey = selectedCategory?.id || "general";
          groupName = selectedCategory?.name || "Featured";
          groupSlug = selectedCategory?.slug || "featured";
        }
      } else {
        // All Products: Group by root category
        if (product.category?.name) {
          groupKey = product.category.id;
          groupName = product.category.name;
          groupSlug = product.category.slug || product.category.id;
        } else if (product.categoryId && categoryMap.has(product.categoryId)) {
          const resolved = categoryMap.get(product.categoryId)!;
          groupKey = resolved.id;
          groupName = resolved.name;
          groupSlug = resolved.slug;
        } else if (product.subcategory?.name) {
          groupKey = product.subcategory.id;
          groupName = product.subcategory.name;
          groupSlug = product.subcategory.slug || product.subcategory.id;
        } else {
          groupKey = "featured";
          groupName = "Featured";
          groupSlug = "featured";
        }
      }

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          id: groupKey,
          name: groupName,
          slug: groupSlug,
          products: [],
        });
      }
      groupMap.get(groupKey)!.products.push(product);
    }

    return Array.from(groupMap.values());
  }, [rawProducts, selectedCategoryId, selectedCategory, categoryMap]);

  const filteredGroups = subcategoryGroups;

  const scrollToSubcategory = (subcatSlug: string) => {
    setActiveTab(subcatSlug);
    const element = document.getElementById(`subcat-${subcatSlug}`);
    if (element) {
      const yOffset = -120;
      const y =
        element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  const handleResetFilters = () => {
    setMinPrice("");
    setMaxPrice("");
    setInStock(false);
    setSortBy("newest");
    setSelectedCategoryId("");
    setSearchInput("");
    setActiveTab("");
  };

  const hasActiveFilters = Boolean(
    search || selectedCategoryId || inStock || minPrice || maxPrice || sortBy !== "newest"
  );

  return (
    <CustomerLayout categories={allCategories}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              {selectedCategory?.name ?? "All Products"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Explore authentic products from vetted independent vendors across Nigeria.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products..."
              className="h-10 rounded-full border-neutral-200 bg-neutral-50 pl-10 pr-9 text-sm focus:bg-white"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills and Drawer Trigger */}
        <div className="mb-8 border-b border-border/60 pb-4">
          <div className="flex items-center justify-between gap-4">
            {/* Subcategory / Category Navigation Pill Tabs */}
            {filteredGroups.length > 1 ? (
              <div
                ref={tabsScrollRef}
                className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`rounded-full px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                    !activeTab
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200"
                  }`}
                >
                  All Sections
                </button>
                {filteredGroups.map((group) => {
                  const isSelected = activeTab === group.slug;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => scrollToSubcategory(group.slug)}
                      className={`rounded-full px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                        isSelected
                          ? "bg-black text-white dark:bg-white dark:text-black"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200"
                      }`}
                    >
                      {group.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div />
            )}

            {/* Filter Drawer Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFilterDrawerOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-foreground hover:bg-neutral-50 transition-colors shrink-0"
            >
              <span>Filters</span>
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Active filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-800">
                &ldquo;{searchInput}&rdquo;
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="hover:text-black"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {selectedCategory && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-800">
                {selectedCategory.name}
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId("")}
                  className="hover:text-black"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {inStock && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-800">
                In Stock
                <button
                  type="button"
                  onClick={() => setInStock(false)}
                  className="hover:text-black"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {(minPrice || maxPrice) && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-800">
                ₦{minPrice || "0"} – ₦{maxPrice || "Any"}
                <button
                  type="button"
                  onClick={() => {
                    setMinPrice("");
                    setMaxPrice("");
                  }}
                  className="hover:text-black"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-primary underline hover:text-primary/80 ml-2 cursor-pointer"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Product Catalog Display */}
        {productQuery.isError && rawProducts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-16 text-center">
            <p className="text-sm text-destructive">Products could not be loaded.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void productQuery.refetch()}
              className="mt-4 rounded-full"
            >
              Try again
            </Button>
          </div>
        ) : isClientLoading ? (
          <div className="py-6">
            <ProductGridSkeleton count={8} />
          </div>
        ) : rawProducts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-20 text-center">
            <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground/60" />
            <h3 className="mt-4 text-base font-bold text-foreground">
              No products available yet
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Check back soon as new products are being added.
            </p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <h3 className="mt-3 text-sm sm:text-base font-bold text-foreground">
              No products found
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {search
                ? `No products match "${searchInput}" with active filters.`
                : "No products match the selected filters."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="mt-4 rounded-full"
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="space-y-12 sm:space-y-16">
            {filteredGroups.map((group) => (
              <section
                key={group.id}
                id={`subcat-${group.slug}`}
                className="scroll-mt-28"
              >
                {/* Section Heading */}
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-6 flex items-center justify-between border-b border-border/40 pb-3">
                  <span>{group.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    ({group.products.length} {group.products.length === 1 ? "item" : "items"})
                  </span>
                </h2>

                {/* Product Grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 sm:gap-x-6 sm:gap-y-10">
                  {group.products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <nav
            aria-label="Product pages"
            className="mt-10 flex items-center justify-center gap-4"
          >
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || productQuery.isFetching}
              onClick={() =>
                setPageState({
                  filterKey,
                  page: Math.max(1, page - 1),
                })
              }
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={
                !(pagination.hasNextPage ?? page < pagination.totalPages) ||
                productQuery.isFetching
              }
              onClick={() => setPageState({ filterKey, page: page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}

        {/* Category & Filter Drawer */}
        <CategoryFilterDrawer
          key={isFilterDrawerOpen ? "open" : "closed"}
          isOpen={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinPriceChange={(val: string) => setMinPrice(val)}
          onMaxPriceChange={(val: string) => setMaxPrice(val)}
          inStock={inStock}
          onInStockChange={(val: boolean) => setInStock(val)}
          sortBy={sortBy}
          onSortByChange={(val: string) => setSortBy(val)}
          onReset={handleResetFilters}
          totalResults={
            pagination?.totalItems ??
            filteredGroups.reduce((acc, group) => acc + group.products.length, 0)
          }
        />
      </div>
    </CustomerLayout>
  );
}
