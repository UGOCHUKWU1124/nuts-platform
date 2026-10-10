"use client";

import type { CategoryResponseDto } from "@/api/dto/category";
import { ArrowRight, Search, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function normalizeCategoryList(value: unknown): CategoryResponseDto[] {
  if (Array.isArray(value)) return value as CategoryResponseDto[];
  if (value && typeof value === "object" && "data" in value) {
    return normalizeCategoryList((value as { data?: unknown }).data);
  }
  return [];
}

interface GlobalSearchBarProps {
  placeholder?: string;
  variant?: "hero" | "navbar";
  className?: string;
  categories?: CategoryResponseDto[];
}

export function GlobalSearchBar({
  placeholder = "Search products, vendors, categories...",
  variant = "hero",
  className = "",
  categories,
}: GlobalSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const isHero = variant === "hero";

  const popularCategories = normalizeCategoryList(categories);
  const searchChips: CategoryResponseDto[] = popularCategories.slice(0, 6);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const searchTerm = query.trim();
    if (!searchTerm) return;
    router.push(`/search?query=${encodeURIComponent(searchTerm)}`);
  };

  const handleChipClick = (term: string) => {
    router.push(`/search?query=${encodeURIComponent(term)}`);
  };

  return (
    <div
      className={`relative w-full ${isHero ? "max-w-2xl mx-auto" : "max-w-md"} ${className}`}
    >
      {/* Search Input Box */}
      <form
        onSubmit={handleSubmit}
        className={`relative flex items-center transition-all ${
          isHero
            ? "rounded-2xl border-2 border-border/80 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl focus-within:border-black dark:focus-within:border-white focus-within:ring-2 focus-within:ring-black/10 dark:focus-within:ring-white/10"
            : "rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 focus-within:border-black dark:focus-within:border-white focus-within:bg-card focus-within:ring-2 focus-within:ring-black/10 dark:focus-within:ring-white/10"
        }`}
      >
        <div className="flex items-center pl-3 text-muted-foreground">
          <Search className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>

        <input
          type="text"
          value={query}
          maxLength={100}
          aria-label="Search marketplace"
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
        />

        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search query"
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <button
          type="submit"
          aria-label="Submit search"
          className={`cursor-pointer ${
            isHero
              ? "rounded-xl bg-black dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-black shadow-md hover:opacity-90 transition-all hover:scale-[1.02]"
              : "rounded-full bg-black/10 dark:bg-white/10 p-1.5 text-foreground hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
          }`}
        >
          {isHero ? "Search" : <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      {/* Quick Search Chips on Hero */}
      {isHero && searchChips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground font-medium">
            <Sparkles className="h-3 w-3 text-neutral-500" /> Explore:
          </span>
          {searchChips.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleChipClick(cat.name)}
              className="rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-muted-foreground transition-all hover:border-black dark:hover:border-white hover:text-foreground cursor-pointer"
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
