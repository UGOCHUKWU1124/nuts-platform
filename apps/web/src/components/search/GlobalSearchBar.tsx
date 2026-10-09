"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import { publicApi } from "@/api/core/client";
import type { CategoryResponseDto } from "@/api/dto/category";
import { formatPrice } from "@/lib/util";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Layers,
  Loader2,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  X,
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hook/use-debounced-value";

function normalizeCategoryList(value: unknown): CategoryResponseDto[] {
  if (Array.isArray(value)) return value as CategoryResponseDto[];
  if (value && typeof value === "object" && "data" in value) {
    return normalizeCategoryList((value as { data?: unknown }).data);
  }
  return [];
}

interface SearchItemPayload {
  id?: string;
  name?: string;
  sku?: string;
  slug?: string;
  price?: number;
  imageUrl?: string | null;
  storeName?: string;
  storeSlug?: string;
  storeLogoUrl?: string | null;
  storeDescription?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  parentSlug?: string | null;
  path?: string | null;
  isSubcategory?: boolean;
}

export interface SearchResultItem {
  id: string;
  index: string;
  type: string;
  title: string;
  subtitle?: string;
  score: number;
  payload?: SearchItemPayload;
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

interface GlobalSearchBarProps {
  placeholder?: string;
  variant?: "hero" | "navbar";
  className?: string;
  categories?: CategoryResponseDto[];
}

export function GlobalSearchBar({
  placeholder = "Search products, categories, vendors...",
  variant = "hero",
  className = "",
  categories,
}: GlobalSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 160);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Server-first RSC category fallback chips
  const popularCategories = useMemo(
    () => normalizeCategoryList(categories),
    [categories]
  );

  // Unified Omnisearch Autocomplete Query
  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["global-search-autocomplete", debouncedQuery],
    queryFn: async ({ signal }) => {
      if (!debouncedQuery || debouncedQuery.length < 2) return null;

      try {
        const res = await publicApi.get<AutocompleteApiResponse>(
          "/search/autocomplete",
          {
            params: { query: debouncedQuery, limit: 12 },
            signal,
          }
        );

        const items: SearchResultItem[] = res.data?.results ?? [];
        return items;
      } catch {
        // Graceful client fallback using local categories if backend search fails
        const normalized = debouncedQuery.toLowerCase();
        const fallbackCats = popularCategories
          .filter(
            (c) =>
              c.name.toLowerCase().includes(normalized) ||
              c.slug.toLowerCase().includes(normalized)
          )
          .slice(0, 4)
          .map((c) => ({
            id: c.id,
            index: "categories",
            type: "category",
            title: c.name,
            subtitle: c.description ?? undefined,
            score: 1,
            payload: {
              id: c.id,
              name: c.name,
              slug: c.slug,
              isSubcategory: false,
            },
          }));

        return fallbackCats;
      }
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 1000 * 60,
    placeholderData: (previousData) => previousData,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const searchTerm = query.trim();
    if (searchTerm.length < 2) return;
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(searchTerm)}`);
  };

  const handleTagClick = (tag: string) => {
    setQuery(tag);
    setIsOpen(true);
  };

  const results: SearchResultItem[] = useMemo(() => data ?? [], [data]);

  // Group omnisearch items cleanly into distinct buckets
  const productItems = useMemo(
    () => results.filter((r) => r.type === "product" || r.index === "products"),
    [results]
  );

  const vendorItems = useMemo(
    () => results.filter((r) => r.type === "vendor" || r.index === "vendors"),
    [results]
  );

  const categoryItems = useMemo(
    () => results.filter((r) => r.type === "category" && !r.payload?.isSubcategory),
    [results]
  );

  const subcategoryItems = useMemo(
    () => results.filter((r) => r.type === "subcategory" || r.payload?.isSubcategory),
    [results]
  );

  const hasResults =
    productItems.length > 0 ||
    vendorItems.length > 0 ||
    categoryItems.length > 0 ||
    subcategoryItems.length > 0;

  const isHero = variant === "hero";
  const searchChips: CategoryResponseDto[] = popularCategories.slice(0, 6);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${isHero ? "max-w-2xl mx-auto" : "max-w-md"} ${className}`}
    >
      {/* Search Input Box */}
      <form
        onSubmit={handleSubmit}
        className={`relative flex items-center transition-all ${
          isHero
            ? "rounded-2xl border-2 border-border/80 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
            : "rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 focus-within:border-primary focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/10"
        }`}
      >
        <div className="flex items-center pl-3 text-muted-foreground">
          {isFetching ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Search className="h-5 w-5" />
          )}
        </div>

        <input
          type="text"
          value={query}
          maxLength={100}
          aria-label="Search products, categories, vendors..."
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
        />

        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <button
          type="submit"
          className={`${
            isHero
              ? "rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all hover:scale-[1.02]"
              : "rounded-full bg-primary/10 p-1.5 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          }`}
        >
          {isHero ? "Search" : <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      {/* Dynamic Search Chips from Backend Categories */}
      {isHero && searchChips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground font-medium">
            <Sparkles className="h-3 w-3 text-primary" /> Popular:
          </span>
          {searchChips.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleTagClick(cat.name)}
              className="rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-muted-foreground transition-all hover:border-primary/40 hover:bg-card hover:text-primary"
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Omnisearch Autocomplete Dropdown Panel */}
      {isOpen && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(75dvh,32rem)] overflow-y-auto rounded-2xl border border-border/80 bg-card/98 p-3 shadow-2xl backdrop-blur-2xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Searching marketplace...
            </div>
          ) : !hasResults ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results found for <span className="font-semibold text-foreground">&quot;{query}&quot;</span>
              <p className="mt-1 text-xs">Try searching for other keywords, categories, or vendors.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Products Section */}
              {productItems.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                      Products
                    </span>
                    <span>{productItems.length} found</span>
                  </div>

                  <div className="space-y-1">
                    {productItems.slice(0, 4).map((p) => {
                      const slug = p.payload?.slug || p.id;
                      const img = p.payload?.imageUrl || null;
                      const price = p.payload?.price;

                      return (
                        <Link
                          key={p.id}
                          href={`/product/${slug}`}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/60"
                        >
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
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
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {p.title}
                            </p>
                            {price !== undefined && (
                              <p className="text-sm font-semibold text-primary">
                                {formatPrice(Number(price))}
                              </p>
                            )}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subcategories (Sections) Section */}
              {subcategoryItems.length > 0 && (
                <div className="border-t border-border/40 pt-3">
                  <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    Subcategories & Sections
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
                          onClick={() => setIsOpen(false)}
                          className="flex items-center justify-between rounded-xl p-2 transition-colors hover:bg-secondary/60"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {sub.title}
                            </span>
                            {sub.payload?.parentName && (
                              <span className="text-xs text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                                in {sub.payload.parentName}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-primary font-medium">
                            Browse section →
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Root Categories Section */}
              {categoryItems.length > 0 && (
                <div className="border-t border-border/40 pt-3">
                  <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-primary" />
                    Departments & Categories
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {categoryItems.slice(0, 4).map((cat) => {
                      const slug = cat.payload?.slug || cat.title.toLowerCase();
                      return (
                        <Link
                          key={cat.id}
                          href={`/category/${slug}`}
                          onClick={() => setIsOpen(false)}
                          className="rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          {cat.title}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Vendors / Stores Section */}
              {vendorItems.length > 0 && (
                <div className="border-t border-border/40 pt-3">
                  <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-primary" />
                    Verified Vendors
                  </div>
                  <div className="space-y-1">
                    {vendorItems.slice(0, 2).map((v) => {
                      const storeSlug = v.payload?.storeSlug || v.id;
                      const logo = v.payload?.storeLogoUrl ?? null;
                      return (
                        <Link
                          key={v.id}
                          href={`/vendor/${storeSlug}`}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center justify-between rounded-xl p-2 transition-colors hover:bg-secondary/60"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center text-xs font-semibold text-primary">
                              {logo ? (
                                <RemoteImage
                                  src={logo}
                                  alt={v.title}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                v.title[0]
                              )}
                            </div>
                            <span className="text-sm font-medium text-foreground">
                              {v.title}
                            </span>
                          </div>
                          <span className="text-xs text-primary font-medium">
                            View Store →
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <Link
            href={`/search?q=${encodeURIComponent(query.trim())}`}
            onClick={() => setIsOpen(false)}
            className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-secondary"
          >
            View all results for “{query.trim()}”
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
