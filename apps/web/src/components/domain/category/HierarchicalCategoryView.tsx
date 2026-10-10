"use client";

import { useMemo, useState } from "react";
import Link from "@/components/navigation/AppLink";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { ProductCard } from "@/component/product/ProductCard";
import { ProductDetailView } from "@/component/product/ProductDetailView";
import { ProductGridSkeleton } from "@/component/product/ProductGridSkeleton";
import { RemoteImage } from "@/component/ui/RemoteImage";
import { Input } from "@/component/ui/input";
import { useQuery } from "@tanstack/react-query";
import { productService } from "@/api";
import type { CategoryResponseDto } from "@/api/dto/category";
import type { ProductCardDto, PublicProductResponseDto } from "@/api/dto/product";
import type { ProductReviewsMetaDto, ReviewResponseDto } from "@/api/dto/review";
import {
  ChevronRight,
  Home,
  Layers,
  Search,
  X,
} from "lucide-react";
import { getNodeChildren, resolveCategoryPath } from "@/lib/cart-path";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export interface HierarchicalCategoryViewProps {
  slugs: string[];
  initialCategories: CategoryResponseDto[];
  initialCategoryNode?: CategoryResponseDto | null;
  initialProducts: ProductCardDto[];
  initialProduct?: PublicProductResponseDto | null;
  initialReviews?: { data: ReviewResponseDto[]; meta?: ProductReviewsMetaDto } | null;
  initialSearchParams?: {
    search?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
    inStock?: boolean;
  };
}

export function HierarchicalCategoryView({
  slugs,
  initialCategories,
  initialCategoryNode,
  initialProducts,
  initialProduct,
  initialReviews,
  initialSearchParams,
}: HierarchicalCategoryViewProps) {
  // If the path resolves to an individual product, render the Product Detail View
  if (initialProduct) {
    return (
      <ProductDetailView
        slug={initialProduct.slug || slugs[slugs.length - 1] || ""}
        initialProduct={initialProduct}
        initialReviews={initialReviews}
        categories={initialCategories}
      />
    );
  }

  return (
    <CategoryCatalogContent
      slugs={slugs}
      categories={initialCategories}
      categoryNode={initialCategoryNode}
      initialProducts={initialProducts}
      initialFilters={initialSearchParams}
    />
  );
}

function CategoryCatalogContent({
  slugs,
  categories,
  categoryNode,
  initialProducts,
  initialFilters,
}: {
  slugs: string[];
  categories: CategoryResponseDto[];
  categoryNode?: CategoryResponseDto | null;
  initialProducts: ProductCardDto[];
  initialFilters?: {
    search?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
    inStock?: boolean;
  };
}) {
  const [searchInput, setSearchInput] = useState(initialFilters?.search || "");
  const search = useDebouncedValue(searchInput.trim(), 250);
  const [sortBy, setSortBy] = useState(initialFilters?.sort || "newest");
  const minPrice = initialFilters?.minPrice || "";
  const maxPrice = initialFilters?.maxPrice || "";
  const inStock = Boolean(initialFilters?.inStock);
  const page = 1;

  // Compute category ancestry and direct child categories
  const traversal = useMemo(() => resolveCategoryPath(categories, slugs), [categories, slugs]);
  const activeCategory = categoryNode || traversal.matchedNode;

  // Direct subcategories under current level
  const subcategories = useMemo(() => {
    if (!activeCategory) return [];
    return getNodeChildren(activeCategory);
  }, [activeCategory]);

  // Construct dynamic breadcrumb ancestry
  const breadcrumbs = useMemo(() => {
    const crumbs: Array<{ label: string; href: string }> = [
      { label: "Home", href: "/" },
    ];

    if (traversal.breadcrumbs && traversal.breadcrumbs.length > 0) {
      for (const b of traversal.breadcrumbs) {
        crumbs.push({ label: b.name, href: b.href });
      }
    } else {
      let accumulatedPath = "/category";
      for (const node of traversal.matchedChain) {
        accumulatedPath += `/${encodeURIComponent(node.slug)}`;
        crumbs.push({
          label: node.name,
          href: accumulatedPath,
        });
      }
    }

    return crumbs;
  }, [traversal.breadcrumbs, traversal.matchedChain]);

  // Database-backed live product query for this category
  const minPriceNum = minPrice.trim() ? Number(minPrice) : undefined;
  const maxPriceNum = maxPrice.trim() ? Number(maxPrice) : undefined;

  const productQuery = useQuery({
    queryKey: [
      "category-products",
      activeCategory?.id || slugs.join("/"),
      search,
      sortBy,
      minPrice,
      maxPrice,
      inStock,
      page,
    ],
    queryFn: async ({ signal }) => {
      if (!activeCategory?.id) return [];
      const res = await productService.getCards(
        {
          categoryId: activeCategory.id,
          search: search || undefined,
          sort: sortBy,
          minPrice: Number.isFinite(minPriceNum) ? minPriceNum : undefined,
          maxPrice: Number.isFinite(maxPriceNum) ? maxPriceNum : undefined,
          inStock: inStock || undefined,
          page,
          limit: 36,
        },
        signal,
      );
      return res.data ?? [];
    },
    initialData:
      page === 1 && !search && !minPrice && !maxPrice && !inStock && sortBy === "newest"
        ? initialProducts
        : undefined,
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 3,
  });

  const products = productQuery.data ?? initialProducts;
  const isLoading = productQuery.isLoading;

  return (
    <CustomerLayout categories={categories}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Dynamic Interactive Breadcrumbs */}
        <nav aria-label="Category hierarchy" className="mb-6 flex items-center flex-wrap gap-1.5 text-xs text-neutral-500">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <span key={crumb.href} className="inline-flex items-center gap-1.5">
                {idx === 0 ? (
                  <Link
                    href={crumb.href}
                    className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                  >
                    <Home className="h-3.5 w-3.5" />
                    <span>Home</span>
                  </Link>
                ) : isLast ? (
                  <span className="font-semibold text-black dark:text-white" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="hover:text-black dark:hover:text-white transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
                {!isLast && <ChevronRight className="h-3 w-3 text-neutral-400" />}
              </span>
            );
          })}
        </nav>

        {/* Level Header */}
        <div className="mb-8 border-b border-neutral-200/80 dark:border-neutral-800 pb-6">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-black dark:text-white">
            {activeCategory?.name || slugs[slugs.length - 1] || "Category"}
          </h1>
          {activeCategory?.description && (
            <p className="mt-2 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 max-w-2xl">
              {activeCategory.description}
            </p>
          )}

          {/* Level 2 Subcategory Navigation Cards / Chips */}
          {subcategories.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                <Layers className="h-3.5 w-3.5" />
                <span>Explore Sections</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {subcategories.map((sub) => {
                  const subHref = `/category/${slugs.join("/")}/${encodeURIComponent(sub.slug)}`;
                  return (
                    <Link
                      key={sub.id}
                      href={subHref}
                      className="group inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-4 py-2 text-xs sm:text-sm font-semibold text-neutral-800 dark:text-neutral-200 hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all shadow-2xs"
                    >
                      {sub.imageUrl && (
                        <div className="h-4 w-4 rounded-full overflow-hidden shrink-0">
                          <RemoteImage
                            src={sub.imageUrl}
                            alt={sub.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <span>{sub.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Filter & Sort Controls */}
        <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search in this category..."
              className="h-10 rounded-full bg-neutral-50 dark:bg-neutral-900 pl-10 pr-8 text-sm focus:bg-white dark:focus:bg-black border-neutral-200 dark:border-neutral-800"
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

          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-4 text-xs sm:text-sm font-semibold text-neutral-800 dark:text-neutral-200 focus:outline-none"
            >
              <option value="newest">Newest Arrivals</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {isLoading ? (
          <div className="py-8">
            <ProductGridSkeleton count={8} />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-800 py-20 text-center">
            <Search className="mx-auto h-10 w-10 text-neutral-400" />
            <h3 className="mt-4 text-base font-bold text-black dark:text-white">
              No products found in this category
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-neutral-500">
              {search
                ? "Try searching for another keyword or browse subcategories above."
                : "Products in this section are currently being updated by our vendors."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 sm:gap-x-6 sm:gap-y-10">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                categoryPath={`/category/${slugs.join("/")}`}
                addedFrom="CATEGORY_PAGE"
              />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
