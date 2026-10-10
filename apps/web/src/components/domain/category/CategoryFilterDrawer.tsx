"use client";

import { Button } from "@/component/ui/button";
import { Input } from "@/component/ui/input";
import { Check,RotateCcw,SlidersHorizontal,X } from "lucide-react";
import { useEffect,useState } from "react";

export interface CategoryFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (val: string) => void;
  onMaxPriceChange: (val: string) => void;
  inStock: boolean;
  onInStockChange: (val: boolean) => void;
  sortBy: string;
  onSortByChange: (val: string) => void;
  onReset: () => void;
}

export function CategoryFilterDrawer({
  isOpen,
  onClose,
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  inStock,
  onInStockChange,
  sortBy,
  onSortByChange,
  onReset,
}: CategoryFilterDrawerProps) {
  // Local draft state so user can configure filters and apply them atomically
  const [draftMinPrice, setDraftMinPrice] = useState(minPrice);
  const [draftMaxPrice, setDraftMaxPrice] = useState(maxPrice);
  const [draftInStock, setDraftInStock] = useState(inStock);
  const [draftSortBy, setDraftSortBy] = useState(sortBy);

  // Prevent background scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApply = () => {
    onMinPriceChange(draftMinPrice);
    onMaxPriceChange(draftMaxPrice);
    onInStockChange(draftInStock);
    onSortByChange(draftSortBy);
    onClose();
  };

  const handleReset = () => {
    setDraftMinPrice("");
    setDraftMaxPrice("");
    setDraftInStock(false);
    setDraftSortBy("newest");
    onReset();
    onClose();
  };

  const hasDraftFilters = Boolean(
    draftMinPrice || draftMaxPrice || draftInStock || draftSortBy !== "newest"
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in-50 duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-card text-card-foreground shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Filter Catalog
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 [scrollbar-width:thin]">
          {/* Sort By */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Sort By
            </label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: "newest", label: "Newest Arrivals" },
                { id: "price_asc", label: "Price: Low to High" },
                { id: "price_desc", label: "Price: High to Low" },
              ].map((option) => {
                const isSelected = draftSortBy === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDraftSortBy(option.id)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-secondary/60 text-foreground hover:bg-secondary hover:text-primary border border-border/40"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Price Range (₦)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] font-medium text-muted-foreground mb-1 block">
                  Minimum Price
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    ₦
                  </span>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={draftMinPrice}
                    onChange={(e) => setDraftMinPrice(e.target.value)}
                    className="h-10 rounded-xl pl-7 text-xs font-medium border-border bg-background"
                  />
                </div>
              </div>
              <div>
                <span className="text-[11px] font-medium text-muted-foreground mb-1 block">
                  Maximum Price
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    ₦
                  </span>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Any"
                    value={draftMaxPrice}
                    onChange={(e) => setDraftMaxPrice(e.target.value)}
                    className="h-10 rounded-xl pl-7 text-xs font-medium border-border bg-background"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Availability */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Availability
            </label>
            <label className="flex items-center justify-between rounded-xl bg-secondary/40 border border-border/60 p-4 cursor-pointer hover:bg-secondary/70 transition-colors">
              <div>
                <span className="text-xs sm:text-sm font-semibold text-foreground block">
                  In Stock Only
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Hide items that are currently sold out
                </span>
              </div>
              <input
                type="checkbox"
                checked={draftInStock}
                onChange={(e) => setDraftInStock(e.target.checked)}
                className="h-4.5 w-4.5 rounded border-border text-primary accent-primary cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-border p-5 flex items-center gap-3 bg-secondary/20">
          {hasDraftFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="rounded-full border-border text-xs font-semibold px-4 h-10 hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold h-10 cursor-pointer shadow-xs"
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
