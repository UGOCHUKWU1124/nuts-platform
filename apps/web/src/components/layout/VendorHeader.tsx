"use client";

import { NotificationBell } from "@/component/notification/NotificationBell";
import { Button } from "@/component/ui/button";
import { useAuthStore } from "@/zustand/auth";
import { logoutWithFeedback } from "@/lib/logout";
import {
BarChart3,
ChevronDown,
ExternalLink,
LogIn,
LogOut,
Menu,
Package,
Store,
Tag,
Wallet
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { usePathname } from "next/navigation";
import { useEffect,useRef,useState } from "react";

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  "/vendor/analytic": { title: "Vendor Analytics", sub: "Sales performance, volume, and revenue metrics" },
  "/vendor/product": { title: "Product Catalog", sub: "Inventory listings, pricing, and stock controls" },
  "/vendor/order": { title: "Order Fulfillment", sub: "Customer purchases, shipments, and status tracking" },
  "/vendor/wallet": { title: "Store Wallet", sub: "Available earnings, pending payouts, and settlements" },
  "/vendor/discount": { title: "Discount Coupons", sub: "Custom promotion codes, limits, and campaigns" },
  "/vendor/setting": { title: "Store Settings", sub: "Brand identity, profile preferences, and theme appearance" },
};

interface VendorHeaderProps {
  onMobileMenuClick?: () => void;
}

export function VendorHeader({ onMobileMenuClick }: VendorHeaderProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, isInitialized, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pageInfo = PAGE_TITLES[pathname] ?? {
    title: "Vendor Store",
    sub: "Manage your storefront and catalog",
  };

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const displayName = firstName
    ? `${firstName} ${lastName}`.trim()
    : user?.email?.split("@")[0] || "Vendor";
  const shortName = firstName || user?.email?.split("@")[0] || "Vendor";
  const initials = firstName
    ? `${firstName[0]}${lastName ? lastName[0] : ""}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "C";

  const storeName = (user as { storeName?: string })?.storeName || "";
  const storeSlug = (user as { storeSlug?: string })?.storeSlug || "";
  const storeHref = storeSlug ? `/vendor/${storeSlug}` : "/";

  return (
    <header className="sticky top-0 z-30 flex h-auto min-h-18 w-full items-center justify-between gap-2 border-b border-border bg-card/80 px-3 py-2 backdrop-blur-xl transition-all sm:h-18 sm:px-6 lg:px-8">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
        {onMobileMenuClick && (
          <button
            type="button"
            onClick={onMobileMenuClick}
            aria-label="Open navigation menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-secondary lg:hidden transition-colors"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        <div className="min-w-0 flex-1 sm:flex-none">
          <h1 className="truncate text-sm font-bold tracking-tight text-foreground sm:text-lg">
            {pageInfo.title}
          </h1>
          <p className="hidden text-xs font-medium text-muted-foreground sm:block">
            {pageInfo.sub}
          </p>
        </div>
      </div>

      {/* Right: Storefront Link & Account Profile */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <Link href={storeHref} target="_blank" rel="noopener noreferrer">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex items-center gap-2 rounded-xl border-border bg-transparent text-xs font-semibold hover:bg-secondary h-9"
          >
            <Store className="h-3.5 w-3.5 text-foreground" />
            <span>Storefront</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </Button>
        </Link>

        {isAuthenticated && <NotificationBell />}

        {/* Auth State */}
        {isLoading && !user ? (
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-900/50 py-1 pl-1.5 pr-3 animate-pulse">
            <div className="h-7 w-7 rounded-full bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3 w-16 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        ) : !isAuthenticated && isInitialized ? (
          <Link href="/auth/vendor/login">
            <Button size="sm" className="rounded-xl gap-1.5 text-xs font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </Button>
          </Link>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/50 py-1.5 pl-2 pr-3 transition-all hover:bg-secondary focus:outline-none"
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold tracking-tight shrink-0 select-none shadow-xs">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col text-left leading-none">
                <span className="text-sm font-bold text-foreground max-w-[120px] truncate">
                  {shortName}
                </span>
                <span className="text-xs font-medium text-muted-foreground mt-0.5">
                  Vendor
                </span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                  dropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {dropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-68 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 z-50"
              >
                {/* User info */}
                <div className="flex items-center gap-3 border-b border-border px-3 py-3 mb-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold">
                    {initials}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <p className="text-sm font-bold text-foreground truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email}
                    </p>
                    {storeName && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground truncate">
                        <Store className="h-3 w-3" />
                        {storeName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Navigation Links */}
                <div className="space-y-0.5">
                  <Link
                    href="/vendor/product"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Product Catalog
                  </Link>
                  <Link
                    href="/vendor/order"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Customer Orders
                  </Link>
                  <Link
                    href="/vendors/wallet"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    Wallet & Payouts
                  </Link>
                  <Link
                    href="/vendor/analytic"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Analytics & Revenue
                  </Link>
                  <Link
                    href="/vendor/discount"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    Discount Coupons
                  </Link>
                </div>

                <div className="border-t border-border my-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      void logoutWithFeedback(logout, { redirectTo: "/auth/vendor/login" });
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
