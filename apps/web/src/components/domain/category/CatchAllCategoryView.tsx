"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import { categoryService,productService } from "@/api";
import type { CategoryResponseDto } from "@/api/dto/category";
import type { ProductReviewsMetaDto, ReviewResponseDto } from "@/api/dto/review";
import type { ProductCardDto,PublicProductResponseDto } from "@/api/dto/product";
import { CategoryFilterDrawer } from "@/component/category/CategoryFilterDrawer";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { ProductCard } from "@/component/product/ProductCard";
import { ProductDetailView } from "@/component/product/ProductDetailView";
import { ProductGridSkeleton } from "@/component/product/ProductGridSkeleton";
import { Button } from "@/component/ui/button";
import { Input } from "@/component/ui/input";
import { findCategoryBreadcrumbs,getNodeChildren,resolveCategoryPath } from "@/lib/cart-path";
import { groupProductsByImmediateCategory } from "@/lib/category-product-groups";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { useQuery } from "@tanstack/react-query";
import {
ChevronLeft,
ChevronRight,
Frown,
Search,
ShoppingBag,
SlidersHorizontal,
X,
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useParams } from "next/navigation";
import { useDeferredValue,useMemo,useState } from "react";

const EMPTY_CATEGORIES: CategoryResponseDto[] = [];
const EMPTY_PRODUCTS: ProductCardDto[] = [];

export interface CatchAllCategoryViewProps {
  slugs: string[];
  initialCategories: CategoryResponseDto[];
  initialCategoryNode?: CategoryResponseDto | null;
  initialProducts: ProductCardDto[];
  initialProduct?: PublicProductResponseDto | null;
  initialReviews?: { data: ReviewResponseDto[]; meta?: ProductReviewsMetaDto } | null;
  isCategoryIndex?: boolean;

  initialSearchParams?: {
    search?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
    inStock?: boolean;
  };
}

export function CatchAllCategoryView({
  slugs: propSlugs,
  initialCategories,
  initialCategoryNode,
  initialProducts,
  initialProduct,
  initialReviews,
  isCategoryIndex = false,
  initialSearchParams,
}: CatchAllCategoryViewProps) {
  const params = useParams();
  const rawSlug = params?.slug;
  const slugs: string[] = propSlugs?.length
    ? propSlugs
    : Array.isArray(rawSlug)
    ? rawSlug
    : typeof rawSlug === "string"
    ? [rawSlug]
    : [];

  const slugPath = slugs.join("/");
  const currentCategoryUrl = slugPath ? `/category/${slugPath}` : "/category";

  // Search input state
  const [searchInput, setSearchInput] = useState(initialSearchParams?.search || "");
  const search = useDeferredValue(searchInput.trim());

  // Filter drawer state
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [minPrice, setMinPrice] = useState(initialSearchParams?.minPrice || "");
  const [maxPrice, setMaxPrice] = useState(initialSearchParams?.maxPrice || "");
  const [inStock, setInStock] = useState(Boolean(initialSearchParams?.inStock));
  const [sortBy, setSortBy] = useState(initialSearchParams?.sort || "newest");
  const [activeTab, setActiveTab] = useState<string>("");

  // 1. Categories delivered directly via RSC props with client fallback
  const { data: clientCategories } = usePublicCategories(initialCategories);

  const tree = clientCategories ?? initialCategories ?? EMPTY_CATEGORIES;
  const traversal = resolveCategoryPath(tree, slugs);

  // 2. Category node resolution with client fallback
  const { data: clientCategoryNode, isLoading: isCategoryResolving } = useQuery({
    queryKey: ["category-by-path", slugPath],
    queryFn: async () => {
      if (!slugPath) return null;
      try {
        const res = await categoryService.findByPath(slugPath);
        return res.data || null;
      } catch {
        if (slugs.length > 1) {
          const lastSlug = slugs[slugs.length - 1];
          if (lastSlug) {
            try {
              const res = await categoryService.findByPath(lastSlug);
              return res.data || null;
            } catch {
              return null;
            }
          }
        }
        return null;
      }
    },
    initialData: initialCategoryNode ?? traversal.matchedNode ?? undefined,
    enabled: Boolean(!initialProduct && !(initialCategoryNode ?? traversal.matchedNode) && slugs.length > 0),
    staleTime: 1000 * 60 * 5,
  });

  const categoryNode: CategoryResponseDto | null =
    initialCategoryNode ?? traversal.matchedNode ?? clientCategoryNode ?? null;

  // Determine if this path targets a product
  const isProduct = Boolean(initialProduct);
  const productSlug = isProduct
    ? (initialProduct?.slug ?? slugs[slugs.length - 1])
    : null;

  const rawChildren = isCategoryIndex
    ? tree.filter((category) => category.isActive && !category.parentId)
    : getNodeChildren(categoryNode);
  const matchedChain = traversal.matchedChain ?? EMPTY_CATEGORIES;
  const rootNode = categoryNode;
  const parentNode = matchedChain.length > 1 ? matchedChain[matchedChain.length - 2] : null;
  const categoryName = categoryNode?.name ?? "Categories";

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

  // Flattened Category Map for subcategory resolution
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
    traverse(tree);
    return map;
  }, [tree]);

  const getProductCategoryPath = (
    product: ProductCardDto,
    fallbackCategoryPath: string,
  ): string => {
    const categoryIds = [
      product.subcategory?.id,
      product.categoryId,
      product.category?.id,
      product.parentSubcategory?.id,
    ].filter((id): id is string => Boolean(id));
    let bestChain:
      | { id: string; slug: string; parentId?: string | null }[]
      | undefined;

    for (const categoryId of categoryIds) {
      const chain: { id: string; slug: string; parentId?: string | null }[] = [];
      const visited = new Set<string>();
      let current = categoryMap.get(categoryId);

      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        chain.push(current);
        current = current.parentId
          ? categoryMap.get(current.parentId)
          : undefined;
      }

      const includesCurrentCategory = chain.some(
        (item) => item.id === categoryNode?.id,
      );
      if (includesCurrentCategory && (!bestChain || chain.length > bestChain.length)) {
        bestChain = chain;
      }
    }

    if (bestChain) {
      return `/category/${[...bestChain]
        .reverse()
        .map((item) => encodeURIComponent(item.slug))
        .join("/")}`;
    }

    const categoryPath = [
      product.subcategory?.path,
      product.category?.path,
      product.parentSubcategory?.path,
    ]
      .filter((path): path is string => Boolean(path))
      .sort((left, right) => right.length - left.length)[0];
    if (categoryPath) {
      const normalizedPath = categoryPath.startsWith("/category/")
        ? categoryPath.slice("/category/".length)
        : categoryPath.replace(/^\/+/, "");
      const pathSegments = normalizedPath.split("/").filter(Boolean);
      if (pathSegments.length > 0) {
        return `/category/${pathSegments.map(encodeURIComponent).join("/")}`;
      }
    }

    return fallbackCategoryPath;
  };

  const handleResetFilters = () => {
    setSearchInput("");
    setMinPrice("");
    setMaxPrice("");
    setInStock(false);
    setSortBy("newest");
    setActiveTab("");
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (minPrice || maxPrice) count++;
    if (inStock) count++;
    if (sortBy !== "newest") count++;
    return count;
  }, [search, minPrice, maxPrice, inStock, sortBy]);

  const hasActiveFilters = activeFiltersCount > 0;

  // 3. Category products query with client fallback if initialProducts returned empty
  const { data: clientCategoryProducts, isLoading: isProductsLoading } = useQuery({
    queryKey: ["category-products", categoryNode?.id || slugPath],
    queryFn: async () => {
      if (!categoryNode?.id && !isCategoryIndex) return [];
      const res = await productService.getCards({
        ...(categoryNode?.id ? { categoryId: categoryNode.id } : {}),
        limit: 100,
      });
      return Array.isArray(res.data) ? res.data : [];
    },
    initialData: initialProducts?.length ? initialProducts : undefined,
    enabled: Boolean(
      !initialProduct &&
        (categoryNode?.id || isCategoryIndex) &&
        !initialProducts?.length,
    ),
    staleTime: 1000 * 60 * 2,
  });

  // Group products by subcategory
  const rawProducts = clientCategoryProducts ?? initialProducts ?? EMPTY_PRODUCTS;
  const subcategoryGroups = groupProductsByImmediateCategory({
    products: rawProducts,
    children: rawChildren,
    categoryTree: tree,
    fallbackCategory: categoryNode,
  });

  // Filter & sort products within each group in-memory
  const filteredGroups = (() => {
    return subcategoryGroups
      .map((group) => {
        let prods = [...group.products];

        if (search) {
          prods = prods.filter(
            (p) =>
              p.name?.toLowerCase().includes(search) ||
              p.vendor?.storeName?.toLowerCase().includes(search) ||
              p.slug?.toLowerCase().includes(search)
          );
        }

        if (inStock) {
          prods = prods.filter((p) => p.stockStatus !== "OUT_OF_STOCK");
        }

        if (minPrice) {
          const min = parseFloat(minPrice);
          if (!isNaN(min)) prods = prods.filter((p) => Number(p.price) >= min);
        }
        if (maxPrice) {
          const max = parseFloat(maxPrice);
          if (!isNaN(max)) prods = prods.filter((p) => Number(p.price) <= max);
        }

        if (sortBy === "price_asc") {
          prods.sort((a, b) => Number(a.price) - Number(b.price));
        } else if (sortBy === "price_desc") {
          prods.sort((a, b) => Number(b.price) - Number(a.price));
        }

        return { ...group, products: prods };
      })
      .filter(
        (group) =>
          group.products.length > 0 ||
          rawChildren.some(
            (child) =>
              child.id === group.id && getNodeChildren(child).length > 0,
          ),
      );
  })();

  // Breadcrumbs for category view
  const breadcrumbItems = (() => {
    if (traversal.breadcrumbs && traversal.breadcrumbs.length > 1) {
      return traversal.breadcrumbs;
    }
    if (isCategoryIndex) {
      return [{ name: "Categories", href: "/category" }];
    }
    if (categoryNode?.id || categoryNode?.slug) {
      const full = findCategoryBreadcrumbs(categoryNode.id || categoryNode.slug, tree);
      if (full && full.length > 0) return full;
    }
    if (categoryNode?.breadcrumbs && categoryNode.breadcrumbs.length > 0) {
      return categoryNode.breadcrumbs.map((breadcrumb) => {
        const path = breadcrumb.path || breadcrumb.slug || breadcrumb.id;
        const normalizedPath = path.startsWith("/category/")
          ? path.slice("/category/".length)
          : path.replace(/^\/+/, "");
        return {
          name: breadcrumb.name,
          href: `/category/${normalizedPath
            .split("/")
            .filter(Boolean)
            .map(encodeURIComponent)
            .join("/")}`,
        };
      });
    }
    if (traversal.breadcrumbs && traversal.breadcrumbs.length > 0) {
      return traversal.breadcrumbs;
    }
    return categoryNode ? [{ name: categoryNode.name, href: currentCategoryUrl }] : [];
  })();

  // Breadcrumbs for product detail view embedded in category catch-all
  const categoryProductBreadcrumbs = isProduct && traversal.breadcrumbs.length > 0
    ? traversal.breadcrumbs
    : undefined;

  const parentBreadcrumb =
    breadcrumbItems.length > 1
      ? breadcrumbItems[breadcrumbItems.length - 2]
      : null;
  const parentBackHref =
    parentNode && matchedChain.length > 1
      ? `/category/${matchedChain
          .slice(0, -1)
          .map((category) => encodeURIComponent(category.slug))
          .join("/")}`
      : parentBreadcrumb?.href ?? null;
  const parentName = parentNode?.name ?? parentBreadcrumb?.name;

  // ─── RENDERING BRANCHES (ALL HOOKS DECLARED ABOVE) ───

  // 1. PRODUCT DETAIL VIEW
  if (isProduct && productSlug) {
    return (
      <CustomerLayout categories={tree}>
        <ProductDetailView
          slug={productSlug}
          initialProduct={initialProduct ?? undefined}
          initialReviews={initialReviews}
          addedFrom="CATEGORY_PAGE"
          fullPath={currentCategoryUrl}
          breadcrumbs={categoryProductBreadcrumbs}
          noLayout
        />
      </CustomerLayout>
    );
  }

  // 2. CATEGORY NOT FOUND STATE
  if (!categoryNode && !isCategoryIndex) {
    if (isCategoryResolving) {
      return (
        <CustomerLayout categories={tree}>
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <ProductGridSkeleton count={8} />
          </div>
        </CustomerLayout>
      );
    }
    return (
      <CustomerLayout categories={tree}>
        <div className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
            <Frown className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground">
            Category Not Found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            The collection &ldquo;{slugPath}&rdquo; could not be located.
          </p>
          <Button asChild className="mt-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/product">Browse All Products</Link>
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout categories={tree}>
      <div className="w-full min-h-[85vh]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Breadcrumb Trail */}
          <nav
            aria-label="Breadcrumb"
            className="mb-4 flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs sm:text-sm text-muted-foreground"
          >
            <Link
              href="/"
              className="font-medium hover:text-foreground hover:underline underline-offset-4 transition-colors"
            >
              Home
            </Link>
            {breadcrumbItems.map((item, index) => {
              const isLast = index === breadcrumbItems.length - 1;
              return (
                <div key={`${item.href}-${index}`} className="flex items-center gap-2 sm:gap-2.5">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                  {isLast ? (
                    <span className="font-bold text-foreground">{item.name}</span>
                  ) : (
                    <Link
                      href={item.href}
                      className="font-medium hover:text-foreground hover:underline underline-offset-4 transition-colors"
                    >
                      {item.name}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Quick Return to Parent */}
          {parentBackHref && parentName && (
            <div className="mb-4">
              <Link
                href={parentBackHref}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors group"
              >
                <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                <span>Back to {parentName}</span>
              </Link>
            </div>
          )}

          {/* Header Section */}
          <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {rootNode?.imageUrl && (
                  <div className="flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-2xl bg-secondary/80 border border-border/80 shadow-2xs shrink-0 p-2 overflow-hidden">
                    <RemoteImage
                      src={rootNode.imageUrl}
                      alt={rootNode.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}
                <div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
                    {categoryName}
                  </h1>
                  {categoryNode?.description ? (
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-2xl">
                      {categoryNode.description}
                    </p>
                  ) : isCategoryIndex ? (
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                      Explore products by category, one section at a time.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                      Curated pieces and authentic designs discovered in this collection.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* In-Category Search Bar */}
            <div className="relative w-full sm:w-72 lg:w-80 shrink-0">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`Search in ${categoryName}...`}
                className="h-10 rounded-full border-border bg-secondary/40 pl-10 pr-9 text-xs sm:text-sm focus:bg-background transition-colors"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Subcategory Pills & Filter Bar */}
          <div className="mb-8 border-b border-border/60 pb-4">
            <div className="flex items-center justify-between gap-4">
              {filteredGroups.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`rounded-full px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                      !activeTab
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
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
                            : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
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

              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors shrink-0 cursor-pointer"
              >
                <span>Filters</span>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {activeFiltersCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Active filters:</span>
              {search && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                  &ldquo;{search}&rdquo;
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="hover:text-primary transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {inStock && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                  In Stock Only
                  <button
                    type="button"
                    onClick={() => setInStock(false)}
                    className="hover:text-primary transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {(minPrice || maxPrice) && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                  ₦{minPrice || "0"} – ₦{maxPrice || "Any"}
                  <button
                    type="button"
                    onClick={() => {
                      setMinPrice("");
                      setMaxPrice("");
                    }}
                    className="hover:text-primary transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {sortBy !== "newest" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                  Sort: {sortBy === "price_asc" ? "Price: Low to High" : "Price: High to Low"}
                  <button
                    type="button"
                    onClick={() => setSortBy("newest")}
                    className="hover:text-primary transition-colors cursor-pointer"
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

          {/* Product Catalog Grid */}
          <div className="pt-2">
            {isProductsLoading ? (
              <div className="py-6">
                <ProductGridSkeleton count={8} />
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/80 bg-secondary/20 py-20 px-6 text-center max-w-2xl mx-auto my-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-4">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  No pieces found in {categoryName}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "No products match your active filters. Try adjusting or clearing your filters."
                    : `We are curating exclusive pieces for this collection. Explore other subcategories or check back soon.`}
                </p>

                {hasActiveFilters ? (
                  <Button
                    onClick={handleResetFilters}
                    variant="outline"
                    className="mt-6 rounded-full text-xs font-semibold border-border hover:bg-secondary cursor-pointer"
                  >
                    Clear Filters
                  </Button>
                ) : (
                  rawChildren.length > 0 && (
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      {rawChildren.slice(0, 4).map((child) => (
                        <Link
                          key={child.id}
                          href={`/category/${slugPath}/${child.slug}`}
                          className="rounded-full bg-secondary hover:bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground transition-all cursor-pointer"
                        >
                          Explore {child.name}
                        </Link>
                      ))}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="space-y-12 sm:space-y-16">
                {filteredGroups.map((group) => (
                  <section
                    key={group.id}
                    id={`subcat-${group.slug}`}
                    className="scroll-mt-28"
                  >
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-6 flex items-center justify-between border-b border-border/40 pb-3">
                      {rawChildren.some((child) => child.id === group.id) ? (
                        <Link
                          href={`${currentCategoryUrl}/${encodeURIComponent(group.slug)}`}
                          aria-label={`Browse ${group.name}`}
                          className="group/section inline-flex items-center gap-1.5 hover:text-primary"
                        >
                          <span>{group.name}</span>
                          <ChevronRight
                            aria-hidden="true"
                            className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover/section:translate-x-0.5 group-hover/section:text-primary group-hover/section:opacity-100"
                          />
                        </Link>
                      ) : (
                        <span>{group.name}</span>
                      )}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({group.products.length} {group.products.length === 1 ? "item" : "items"})
                      </span>
                    </h2>
                    {group.products.length > 0 ? (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 sm:gap-x-6 sm:gap-y-12">
                        {group.products.map((product: ProductCardDto) => (
                          <ProductCard
                            key={product.id}
                            product={product}
                            categoryPath={getProductCategoryPath(
                              product,
                              rawChildren.some((child) => child.id === group.id)
                                ? `${currentCategoryUrl}/${encodeURIComponent(group.slug)}`
                                : currentCategoryUrl,
                            )}
                            addedFrom="CATEGORY_PAGE"
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No products here yet.{" "}
                        <Link
                          href={`${currentCategoryUrl}/${encodeURIComponent(group.slug)}`}
                          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                        >
                          Explore {group.name} subcategories
                        </Link>
                        .
                      </p>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>

          <CategoryFilterDrawer
            key={isFilterDrawerOpen ? "open" : "closed"}
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
            totalResults={filteredGroups.reduce((acc, g) => acc + g.products.length, 0)}
          />
        </div>
      </div>
    </CustomerLayout>
  );
}
