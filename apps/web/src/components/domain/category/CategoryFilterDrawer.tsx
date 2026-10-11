"use client";

import { Button } from "@/component/ui/button";
import { Input } from "@/component/ui/input";
import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";

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

const SORT_OPTIONS = [
  { id: "newest", label: "Newest Arrivals", description: "Recently added products" },
  { id: "popular", label: "Most Popular", description: "Top trending items" },
  { id: "price_asc", label: "Price: Low to High", description: "Budget friendly first" },
  { id: "price_desc", label: "Price: High to Low", description: "Premium items first" },
];

const PRICE_PRESETS = [
  { label: "All Prices", min: "", max: "" },
  { label: "Under ₦10,000", min: "", max: "10000" },
  { label: "₦10k – ₦50k", min: "10000", max: "50000" },
  { label: "₦50k – ₦100k", min: "50000", max: "100000" },
  { label: "Over ₦100k", min: "100000", max: "" },
];

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

  // Sync draft state with incoming props every time the drawer opens or props change
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setDraftMinPrice(minPrice);
      setDraftMaxPrice(maxPrice);
      setDraftInStock(inStock);
      setDraftSortBy(sortBy || "newest");
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, minPrice, maxPrice, inStock, sortBy]);

  // Lock background scrolling when drawer is open
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

  // Keyboard navigation: Escape key closes drawer
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

  if (!isOpen) return null;

  const handleApply = () => {
    // Normalise min & max if min > max
    let normalizedMin = draftMinPrice.trim();
    let normalizedMax = draftMaxPrice.trim();

    if (normalizedMin && normalizedMax) {
      const minVal = Number(normalizedMin);
      const maxVal = Number(normalizedMax);
      if (!Number.isNaN(minVal) && !Number.isNaN(maxVal) && minVal > maxVal) {
        // Swap values
        const temp = normalizedMin;
        normalizedMin = normalizedMax;
        normalizedMax = temp;
      }
    }

    onMinPriceChange(normalizedMin);
    onMaxPriceChange(normalizedMax);
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

  const handlePresetSelect = (preset: { min: string; max: string }) => {
    setDraftMinPrice(preset.min);
    setDraftMaxPrice(preset.max);
  };

  const isPresetActive = (preset: { min: string; max: string }) => {
    return draftMinPrice === preset.min && draftMaxPrice === preset.max;
  };

  const hasDraftFilters = Boolean(
    draftMinPrice ||
      draftMaxPrice ||
      draftInStock ||
      (draftSortBy && draftSortBy !== "newest")
  );

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in-50 duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-card text-card-foreground shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-foreground">
                Filter & Sort
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Refine products in your current view
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7 [scrollbar-width:thin]">
          {/* Sort By Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Sort Order
              </label>
              <span className="text-[11px] text-muted-foreground">
                {SORT_OPTIONS.find((s) => s.id === draftSortBy)?.label}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {SORT_OPTIONS.map((option) => {
                const isSelected = draftSortBy === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDraftSortBy(option.id)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                        : "bg-secondary/50 text-foreground hover:bg-secondary border border-border/40"
                    }`}
                  >
                    <div>
                      <p className="text-xs sm:text-sm font-semibold">{option.label}</p>
                      <p
                        className={`text-[11px] ${
                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        {option.description}
                      </p>
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary-foreground" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price Range Section */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Price Range (₦)
            </label>

            {/* Quick Presets Pills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {PRICE_PRESETS.map((preset) => {
                const active = isPresetActive(preset);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      active
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">
                  Minimum (₦)
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
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
                <span className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">
                  Maximum (₦)
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
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

          {/* Availability Toggle */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Availability
            </label>
            <label className="flex items-center justify-between rounded-xl bg-secondary/40 border border-border/60 p-4 cursor-pointer hover:bg-secondary/70 transition-colors">
              <div>
                <span className="text-xs sm:text-sm font-semibold text-foreground block">
                  In Stock Only
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Hide out-of-stock and unavailable items
                </span>
              </div>
              <input
                type="checkbox"
                checked={draftInStock}
                onChange={(e) => setDraftInStock(e.target.checked)}
                className="h-5 w-5 rounded border-border text-primary accent-primary cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-border p-5 flex items-center gap-3 bg-secondary/15">
          {hasDraftFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="rounded-full border-border text-xs font-semibold px-4 h-11 hover:bg-secondary flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset All
            </Button>
          )}
          <Button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold h-11 cursor-pointer shadow-xs"
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
