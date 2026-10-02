"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import { publicVendorService } from "@/api";
import type { CategoryResponseDto } from "@/api/dto/category";
import type { VendorResponseDto } from "@/api/dto/vendor";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { Input } from "@/component/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Search,Sparkles,Store,X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue,useMemo,useState } from "react";

const EMPTY_VENDORS: VendorResponseDto[] = [];

function getStoreInitials(name: string): string {
  if (!name) return "CR";
  const words = name.trim().split(/\s+/);
  const first = words[0];
  const second = words[1];
  if (!first) return "CR";
  if (words.length === 1 || !second) {
    return first.slice(0, 2).toUpperCase();
  }
  return ((first[0] ?? "") + (second[0] ?? "")).toUpperCase() || "CR";
}

export interface VendorsPageViewProps {
  initialCategories: CategoryResponseDto[];
  initialVendors?: VendorResponseDto[];
  
}

export function VendorsPageView({
  initialCategories,
  initialVendors,
  
}: VendorsPageViewProps) {
  const vendorsList = initialVendors ?? EMPTY_VENDORS;
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const search = useDeferredValue(searchInput.trim());

  // Categories delivered directly via RSC props
  const categories = initialCategories ?? [];
  const rootCategories: CategoryResponseDto[] = categories.filter(
    (c) => !c.parentId
  );

  // If the server's first directory request failed, recover in the browser.
  // A successful empty directory is also confirmed by this one request.
  const vendorsQuery = useQuery({
    queryKey: ["vendors-public-list", "all"],
    queryFn: async () => (await publicVendorService.list()).data,
    enabled: vendorsList.length === 0,
    staleTime: 1000 * 60 * 10,
  });
  const vendorDirectory = useMemo(
    () => vendorsList.length > 0 ? vendorsList : vendorsQuery.data ?? [],
    [vendorsList, vendorsQuery.data],
  );
  const isLoadingVendors = vendorsList.length === 0 && vendorsQuery.isLoading;

  // The server page supplies the complete directory with each vendor's root
  // category memberships. Filtering that payload locally keeps these controls
  // immediate and avoids a round trip for every category/search change.
  const displayedVendors = useMemo(() => {
    const normalizedSearch = search.toLocaleLowerCase();
    return vendorDirectory.filter((vendor) => {
      const matchesCategory =
        selectedCategoryId === "ALL" ||
        vendor.categories?.some(
          (category: { id: string }) => category.id === selectedCategoryId,
        );
      const matchesSearch =
        !normalizedSearch ||
        vendor.storeName?.toLocaleLowerCase().includes(normalizedSearch) ||
        vendor.storeDescription?.toLocaleLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [vendorDirectory, search, selectedCategoryId]);

  return (
    <CustomerLayout categories={categories}>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 border-b border-neutral-200/80 pb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Discover Our Vendors
            </h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">
              Shop directly from verified independent vendors and local artisans across Nigeria.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search stores by name..."
              className="h-10 rounded-full border-border bg-secondary/50 pl-10 pr-9 text-sm focus:bg-background"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-8 items-start">
          {/* Left Column: Vertical Category Filter Pills */}
          <aside className="space-y-2 lg:sticky lg:top-24">
            {/* "All Stores" Pill */}
            <button
              type="button"
              onClick={() => setSelectedCategoryId("ALL")}
              className={`w-full flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm font-medium transition-all ${
                selectedCategoryId === "ALL"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-card text-foreground border-border hover:bg-secondary"
              }`}
            >
              <div className="flex h-5 w-5 items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="truncate">All Stores</span>
            </button>

            {/* Dynamic Root Categories from DB */}
            {rootCategories.map((cat) => {
              const isSelected = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`w-full flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-card text-foreground border-border hover:bg-secondary"
                  }`}
                >
                  <div className="flex h-5 w-5 items-center justify-center shrink-0">
                    {cat.imageUrl ? (
                      <RemoteImage
                        src={cat.imageUrl}
                        alt={cat.name}
                        className="h-4 w-4 object-contain"
                      />
                    ) : (
                      <span className="text-xs font-bold">{cat.name.charAt(0)}</span>
                    )}
                  </div>
                  <span className="truncate">{cat.name}</span>
                </button>
              );
            })}
          </aside>

          {/* Right Column: 3-Column Vendor Cards Grid */}
          <section>
            {isLoadingVendors ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-56 animate-pulse rounded-2xl bg-neutral-100" />
                ))}
              </div>
            ) : !displayedVendors || displayedVendors.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border py-20 text-center">
                <p className="font-semibold text-foreground">
                  No stores found in this category
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try selecting &ldquo;All Stores&rdquo; to browse all stores.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId("ALL");
                    setSearchInput("");
                  }}
                  className="mt-5 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs"
                >
                  Show All Stores
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {displayedVendors.map((vendor) => {
                  const initials = getStoreInitials(vendor.storeName);
                  const vendorCategories = vendor.categories ?? [];

                  return (
                    <Link
                      key={vendor.storeSlug}
                      href={`/vendor/${vendor.storeSlug}`}
                      className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-3 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                    >
                      <div>
                        {/* Banner Image Container */}
                        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-secondary">
                          {vendor.storeLogoUrl ? (
                            <RemoteImage
                              src={vendor.storeLogoUrl}
                              alt={vendor.storeName}
                              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground">
                              <Store className="h-10 w-10 stroke-[1.2]" />
                            </div>
                          )}
                        </div>

                        {/* Overlapping Brand Logo Avatar */}
                        <div className="relative -mt-6 ml-3 h-12 w-12 rounded-full border-2 border-border bg-card shadow-sm overflow-hidden flex items-center justify-center font-bold text-foreground text-sm z-10">
                          {vendor.storeLogoUrl ? (
                            <RemoteImage
                              src={vendor.storeLogoUrl}
                              alt={vendor.storeName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </div>

                        {/* Store Info */}
                        <div className="mt-2 px-1">
                          <h2 className="font-semibold text-base sm:text-lg text-foreground truncate group-hover:text-primary transition-colors">
                            {vendor.storeName}
                          </h2>

                          {/* Category Tags at Bottom */}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {vendorCategories.length > 0 ? (
                              vendorCategories.slice(0, 3).map((c, i) => (
                                <span key={c.id} className="inline-flex items-center">
                                  {i > 0 && <span className="mx-1 text-muted-foreground/40">•</span>}
                                  <span>{c.name}</span>
                                </span>
                              ))
                            ) : (
                              <span>Vendor Store</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </CustomerLayout>
  );
}
