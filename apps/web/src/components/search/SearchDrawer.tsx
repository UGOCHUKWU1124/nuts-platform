"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Layers,
  ShoppingBag,
  Store,
  Tag,
  X,
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { RemoteImage } from "@/component/ui/RemoteImage";
import { publicApi } from "@/api/core/client";
import { publicVendorService } from "@/api/modules/vendor";
import type { CategoryResponseDto } from "@/api/dto/category";
import type { ProductCardDto } from "@/api/dto/product";
import type { VendorResponseDto } from "@/api/dto/vendor";
import { formatPrice } from "@/lib/util";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { SearchResultItem } from "./GlobalSearchBar";

function normalizeCategories(value: unknown): CategoryResponseDto[] {
  if (Array.isArray(value)) return value as CategoryResponseDto[];
  if (value && typeof value === "object" && "data" in value) {
    return normalizeCategories((value as { data?: unknown }).data);
  }
  return [];
}

interface AutocompleteApiResponse {
  results: SearchResultItem[];
  pagination?: {
    totalItems: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface SearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  categories?: CategoryResponseDto[];
  initialQuery?: string;
}

export function SearchDrawer({
  isOpen,
  onClose,
  categories,
  initialQuery = "",
}: SearchDrawerProps) {
  const router = useRouter();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [query, setQuery] = useState(initialQuery);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      if (initialQuery) setQuery(initialQuery);
    } else {
      setQuery("");
    }
  }

  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Immediate autofocus on open
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle hardware keyboard Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const popularCategories = useMemo(
    () => normalizeCategories(categories),
    [categories]
  );

  // Fetch real popular products from database for quick suggestions
  const { data: popularProductsData } = useQuery({
    queryKey: ["search-drawer-popular-products"],
    queryFn: async ({ signal }) => {
      try {
        const res = await publicApi.get<ProductCardDto[] | { data: ProductCardDto[] }>(
          "/products?limit=8&sort=newest",
          { signal }
        );
        const raw = res.data;
        if (Array.isArray(raw)) return raw;
        if (
          raw &&
          typeof raw === "object" &&
          "data" in raw &&
          Array.isArray((raw as { data: unknown }).data)
        ) {
          return (raw as { data: ProductCardDto[] }).data;
        }
        return [];
      } catch {
        return [];
      }
    },
    enabled: isOpen,
    staleTime: 1000 * 60 * 5,
  });

  // Quick suggestions: Products ONLY, without any tagging
  const productSuggestions = useMemo(() => {
    const products = popularProductsData ?? [];
    return products.slice(0, 8).map((p) => ({
      id: p.id,
      name: p.name,
      href: `/product/${p.slug || p.id}`,
    }));
  }, [popularProductsData]);

  // Fetch Recommended Vendors from API (pure database data, no fake fallbacks)
  const { data: recommendedVendorsData } = useQuery({
    queryKey: ["search-drawer-recommended-vendors"],
    queryFn: async ({ signal }) => {
      try {
        const res = await publicVendorService.list({ limit: 10 }, signal);
        const raw = res.data as unknown as Record<string, unknown> | VendorResponseDto[];
        const items: VendorResponseDto[] = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.data)
          ? ((raw as Record<string, unknown>).data as VendorResponseDto[])
          : [];
        return items;
      } catch {
        return [];
      }
    },
    enabled: isOpen,
    staleTime: 1000 * 60 * 5,
  });

  const recommendedVendors = useMemo(() => {
    return recommendedVendorsData ?? [];
  }, [recommendedVendorsData]);

  // Real-time Omnisearch Autocomplete Query
  const { data: searchResultsData, isFetching } = useQuery({
    queryKey: ["search-drawer-autocomplete", debouncedQuery],
    queryFn: async ({ signal }) => {
      if (!debouncedQuery || debouncedQuery.length < 2) return null;

      try {
        const res = await publicApi.get<AutocompleteApiResponse>(
          "/search/autocomplete",
          {
            params: { query: debouncedQuery, limit: 14 },
            signal,
          }
        );

        const raw = res.data as unknown as Record<string, unknown> | SearchResultItem[];
        const items: SearchResultItem[] = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.data)
          ? ((raw as Record<string, unknown>).data as SearchResultItem[])
          : Array.isArray((raw as Record<string, unknown>)?.results)
          ? ((raw as Record<string, unknown>).results as SearchResultItem[])
          : [];
        return items;
      } catch (error) {
        if (signal?.aborted) throw error;

        // Fallback search in user's real categories
        const normalized = debouncedQuery.toLowerCase();
        return popularCategories
          .filter(
            (c) =>
              c.name.toLowerCase().includes(normalized) ||
              c.slug.toLowerCase().includes(normalized)
          )
          .slice(0, 5)
          .map((c) => ({
            id: c.id,
            index: "categories",
            type: "category",
            title: c.name,
            subtitle: c.description ?? undefined,
            score: 1,
            payload: { id: c.id, name: c.name, slug: c.slug, isSubcategory: false },
          }));
      }
    },
    enabled: isOpen && debouncedQuery.length >= 2,
    staleTime: 1000 * 60,
  });

  const results: SearchResultItem[] = useMemo(
    () => searchResultsData ?? [],
    [searchResultsData]
  );

  const productItems = useMemo(
    () => results.filter((r) => r.type === "product" || r.index === "products"),
    [results]
  );

  const vendorItems = useMemo(
    () => results.filter((r) => r.type === "vendor" || r.index === "vendors"),
    [results]
  );

  const categoryItems = useMemo(
    () =>
      results.filter((r) => r.type === "category" && !r.payload?.isSubcategory),
    [results]
  );

  const subcategoryItems = useMemo(
    () =>
      results.filter(
        (r) => r.type === "subcategory" || r.payload?.isSubcategory
      ),
    [results]
  );

  const hasResults =
    productItems.length > 0 ||
    vendorItems.length > 0 ||
    categoryItems.length > 0 ||
    subcategoryItems.length > 0;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const term = query.trim();
    if (!term) return;
    onClose();
    router.push(`/search?query=${encodeURIComponent(term)}`);
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search Panel"
      className="fixed inset-0 z-[9999] flex justify-end"
    >
      {/* Background Dim / Blur Overlay — Clicking outside closes the drawer */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 cursor-pointer"
        aria-hidden="true"
      />

      {/* Main Drawer Panel — Responsive across mobile (full width / 100dvh) and tablet/PC (slide-in right) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-[100dvh] w-full flex-col bg-background shadow-2xl backdrop-blur-2xl sm:w-[480px] md:w-[520px] lg:w-[560px] max-w-full border-l-0 sm:border-l border-border/80 animate-in slide-in-from-right duration-200"
      >
        {/* Top Search Input Bar (Clean, plain 'Search' placeholder, no icons inside input) */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border/80 bg-background/95 px-3 py-2.5 sm:px-4 sm:py-3.5 backdrop-blur-md">
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 items-center rounded-full border border-border/80 bg-secondary/60 px-3.5 py-1.5 sm:px-4 sm:py-2 transition-all focus-within:border-black dark:focus-within:border-white focus-within:bg-card focus-within:ring-2 focus-within:ring-black/10 dark:focus-within:ring-white/10 min-w-0"
          >
            <input
              ref={inputRef}
              autoFocus
              type="text"
              id="search-drawer-input"
              name="search"
              value={query}
              maxLength={100}
              placeholder="Search"
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-base sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />

            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search text"
                className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>

          {/* Explicit Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-secondary hover:text-foreground cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" />
            <span>Close</span>
          </button>
        </div>

        {/* Scrollable Viewport with SCROLLBAR / SLIDER TOTALLY ELIMINATED */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-5 overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* STATE A: Pre-search (Empty Query) */}
          {!query.trim() && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              {/* "Recommended For You" — Only shown if real vendors exist in database */}
              {recommendedVendors.length > 0 && (
                <div>
                  <div className="mb-3 px-1 text-sm font-semibold tracking-tight text-foreground">
                    Recommended For You
                  </div>

                  <div className="divide-y divide-border/60 rounded-2xl border border-border/80 bg-card/60 overflow-hidden shadow-xs">
                    {recommendedVendors.slice(0, 8).map((vendor) => {
                      const slug = vendor.storeSlug || vendor.id;
                      const logo = vendor.storeLogoUrl || vendor.storeLogo;
                      const initial = vendor.storeName
                        ? vendor.storeName.charAt(0).toUpperCase()
                        : "S";

                      return (
                        <Link
                          key={vendor.id}
                          href={`/vendor/${slug}`}
                          onClick={onClose}
                          className="group flex items-center justify-between gap-3 p-3 transition-colors hover:bg-secondary/60 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Store Avatar Logo */}
                            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted font-bold text-foreground">
                              {logo ? (
                                <RemoteImage
                                  src={logo}
                                  alt={vendor.storeName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-sm font-semibold text-foreground/80">
                                  {initial}
                                </span>
                              )}
                            </div>

                            {/* Store Name & Verified Badge */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-medium text-foreground group-hover:underline">
                                  {vendor.storeName}
                                </p>
                                {vendor.isVerified && (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                )}
                              </div>
                              {vendor.storeDescription && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {vendor.storeDescription}
                                </p>
                              )}
                            </div>
                          </div>

                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Suggestions: Products Only, No Tagging */}
              {productSuggestions.length > 0 && (
                <div>
                  <div className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Quick Suggestions
                  </div>
                  <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card/40 overflow-hidden shadow-2xs">
                    {productSuggestions.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={onClose}
                        className="group flex w-full items-center justify-between p-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 cursor-pointer"
                      >
                        <span className="truncate text-foreground/90 group-hover:text-foreground">
                          {item.name}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STATE B: Live Results (When typing >= 2 chars) */}
          {query.trim().length >= 2 && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {isFetching && !hasResults ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Searching marketplace…
                </div>
              ) : !hasResults ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">
                    No instant matches for &ldquo;{query.trim()}&rdquo;
                  </p>
                  <p className="mt-1 text-xs">
                    Tap below to search the complete marketplace catalog.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-black dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-black shadow-xs transition-opacity hover:opacity-90 cursor-pointer"
                  >
                    Search &ldquo;{query.trim()}&rdquo;
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Products Section */}
                  {productItems.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <ShoppingBag className="h-3.5 w-3.5 text-foreground" />
                          Products
                        </span>
                        <span>{productItems.length} found</span>
                      </div>

                      <div className="space-y-1.5">
                        {productItems.slice(0, 6).map((p) => {
                          const slug = p.payload?.slug || p.id;
                          const img = p.payload?.imageUrl || null;
                          const price = p.payload?.price;

                          return (
                            <Link
                              key={p.id}
                              href={`/product/${slug}`}
                              onClick={onClose}
                              className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card/60 p-2.5 transition-colors hover:bg-secondary cursor-pointer"
                            >
                              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted">
                                {img ? (
                                  <RemoteImage
                                    src={img}
                                    alt={p.title}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <ShoppingBag className="h-5 w-5 text-muted-foreground/50" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground group-hover:underline">
                                  {p.title}
                                </p>
                                {p.payload?.storeName && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {p.payload.storeName}
                                  </p>
                                )}
                                {price !== undefined && (
                                  <p className="mt-0.5 text-xs font-semibold text-foreground">
                                    {formatPrice(Number(price))}
                                  </p>
                                )}
                              </div>
                              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Matching Verified Stores Section */}
                  {vendorItems.length > 0 && (
                    <div className="border-t border-border/50 pt-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Store className="h-3.5 w-3.5 text-foreground" />
                        Verified Stores
                      </div>
                      <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-card/60 overflow-hidden">
                        {vendorItems.slice(0, 4).map((v) => {
                          const storeSlug = v.payload?.storeSlug || v.id;
                          const logo = v.payload?.storeLogoUrl ?? null;
                          return (
                            <Link
                              key={v.id}
                              href={`/vendor/${storeSlug}`}
                              onClick={onClose}
                              className="group flex items-center justify-between p-2.5 transition-colors hover:bg-secondary cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-secondary text-xs font-semibold text-foreground">
                                  {logo ? (
                                    <RemoteImage
                                      src={logo}
                                      alt={v.title}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    v.title[0]?.toUpperCase()
                                  )}
                                </div>
                                <span className="truncate text-sm font-medium text-foreground group-hover:underline">
                                  {v.title}
                                </span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Subcategories & Sections */}
                  {subcategoryItems.length > 0 && (
                    <div className="border-t border-border/50 pt-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Layers className="h-3.5 w-3.5 text-foreground" />
                        Sections & Subcategories
                      </div>
                      <div className="space-y-1">
                        {subcategoryItems.slice(0, 3).map((sub) => {
                          const path =
                            sub.payload?.path ||
                            (sub.payload?.parentSlug
                              ? `${sub.payload.parentSlug}/${sub.payload.slug}`
                              : sub.payload?.slug || sub.title.toLowerCase());

                          return (
                            <Link
                              key={sub.id}
                              href={`/category/${path}`}
                              onClick={onClose}
                              className="group flex items-center justify-between rounded-xl p-2.5 transition-colors hover:bg-secondary cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground group-hover:underline">
                                  {sub.title}
                                </span>
                                {sub.payload?.parentName && (
                                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                                    in {sub.payload.parentName}
                                  </span>
                                )}
                              </div>
                              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-foreground" />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Root Categories */}
                  {categoryItems.length > 0 && (
                    <div className="border-t border-border/50 pt-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Tag className="h-3.5 w-3.5 text-foreground" />
                        Categories
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {categoryItems.slice(0, 6).map((cat) => {
                          const slug = cat.payload?.slug || cat.title.toLowerCase();
                          return (
                            <Link
                              key={cat.id}
                              href={`/category/${slug}`}
                              onClick={onClose}
                              className="rounded-lg border border-border/70 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer"
                            >
                              {cat.title}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Bottom Action when query is present */}
        {query.trim().length >= 2 && (
          <div className="sticky bottom-0 border-t border-border/80 bg-background/95 p-3.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black dark:bg-white py-3 text-sm font-semibold text-white dark:text-black shadow-md transition-opacity hover:opacity-90 cursor-pointer"
            >
              View all results for &ldquo;{query.trim()}&rdquo;
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
