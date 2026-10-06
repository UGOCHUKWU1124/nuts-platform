"use client";

import {
Bell,
ChevronDown,
Heart,
LayoutDashboard,
LogOut,
Package,
Search,
Settings,
Shield,
ShoppingCart,
User as UserIcon,
Wallet,
X,
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { usePathname } from "next/navigation";
import { useEffect,useRef,useState } from "react";

import type { CategoryResponseDto } from "@/api/dto/category";
import { CategoryNavMenu } from "@/component/category/CategoryNavMenu";
import { NotificationBell } from "@/component/notification/NotificationBell";
import { GlobalSearchBar } from "@/component/search/GlobalSearchBar";
import { useCart } from "@/hook/use-cart";
import { useHydrated } from "../../hook/use-hydrated";
import { useWishlist } from "@/hook/use-wishlist";
import { usePublicCategories } from "@/hooks/use-public-categories";
import { useAuthStore } from "@/zustand/auth";

function MobileSearchControl({
  categories,
}: {
  categories?: CategoryResponseDto[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="xl:hidden flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Toggle mobile search"
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full border-t border-border/80 bg-background/95 px-4 py-2.5 shadow-md backdrop-blur-md animate-in slide-in-from-top-2 duration-150 xl:hidden">
          <GlobalSearchBar
            categories={categories}
            variant="navbar"
            placeholder="Search products, vendors, categories..."
            className="w-full"
          />
        </div>
      )}
    </>
  );
}

export function Navbar({ categories }: { categories?: CategoryResponseDto[] } = {}) {
  const { data: cachedCategories } = usePublicCategories(categories);
  const navCategories = cachedCategories ?? categories;
  const pathname = usePathname();
  const { user, isAuthenticated, role, logout } = useAuthStore();
  const isMounted = useHydrated();
  const [accountOpen, setAccountOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasSessionCookie =
    typeof document !== "undefined" &&
    (document.cookie.includes("user_session=1") ||
      document.cookie.includes("vendor_session=1") ||
      document.cookie.includes("admin_session=1") ||
      document.cookie.includes("user_access_token") ||
      document.cookie.includes("vendor_access_token") ||
      document.cookie.includes("admin_access_token"));

  const isLoggedIn =
    (isAuthenticated && (!!user || !!role)) ||
    (Boolean(user) && hasSessionCookie);
  const userRole = (role ?? user?.role ?? "").toLowerCase();
  const { count: cartCount } = useCart();
  const { count: wishlistCount } = useWishlist();

  const isLinkActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const displayName = firstName ? `${firstName} ${lastName}`.trim() : user?.email?.split("@")[0] || "Account";
  const shortName = firstName || user?.email?.split("@")[0] || "";
  const initials = firstName
    ? `${firstName[0]}${lastName ? lastName[0] : ""}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  const roleLabel = userRole === "admin" ? "Administrator" : userRole === "vendor" ? "Vendor" : "Member";
  const portalHref = userRole === "admin" ? "/admin" : userRole === "vendor" ? "/vendor/analytic" : null;
  const portalLabel = userRole === "admin" ? "Admin Panel" : "Vendor Portal";
  const PortalIcon = userRole === "admin" ? Shield : LayoutDashboard;

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 lg:px-8">
        {/* Left: Category Menu, Brand Logo & Main Nav */}
        <div className="flex items-center gap-2.5 sm:gap-5 min-w-0">
          <div className="hidden xl:flex">
            <CategoryNavMenu categories={navCategories} />
          </div>

          <Link href="/" className="flex shrink-0 items-center gap-1 group">
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground transition-transform group-hover:scale-105">
              NUTS<span className="inline-block h-1.5 w-1.5 rounded-full bg-primary ml-0.5"></span>
            </span>
          </Link>

          <nav className="hidden xl:flex items-center gap-6 ml-3">
            <Link
              href="/"
              className={`text-sm font-medium transition-colors ${
                pathname === "/" ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Home
            </Link>
            <Link
              href="/product"
              className={`text-sm font-medium transition-colors ${
                pathname.startsWith("/product") ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Products
            </Link>
            <Link
              href="/vendor"
              className={`text-sm font-medium transition-colors ${
                pathname.startsWith("/vendor") ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Vendors
            </Link>
          </nav>
        </div>

        {/* Center: Search Bar (Desktop / Tablet) */}
        <div className="hidden xl:block flex-1 max-w-md mx-4 lg:mx-6">
          <GlobalSearchBar
            categories={navCategories}
            variant="navbar"
            placeholder="Search products, vendors, categories..."
            className="w-full"
          />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Mobile Search Toggle Button */}
          <MobileSearchControl key={pathname} categories={navCategories} />

          <Link
            href="/wishlist"
            className={`relative hidden h-9 w-9 items-center justify-center rounded-full transition-all xl:flex ${
              isLinkActive("/wishlist")
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
            aria-label="Wishlist"
          >
            <Heart className="h-5 w-5" />
            {isMounted && wishlistCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground shadow-xs">
                {wishlistCount}
              </span>
            )}
          </Link>

          <Link
            href="/cart"
            className={`relative hidden h-9 w-9 items-center justify-center rounded-full transition-all xl:flex ${
              isLinkActive("/cart")
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
            aria-label="Shopping Cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {isMounted && cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground shadow-xs">
                {cartCount}
              </span>
            )}
          </Link>

          {isMounted && isLoggedIn && (
            <div className="hidden xl:block">
              <NotificationBell />
            </div>
          )}

          {!isMounted ? (
            <div className="flex items-center gap-2 opacity-0 pointer-events-none" aria-hidden="true">
              <span className="text-xs sm:text-sm font-medium px-2 py-1.5 opacity-0">Sign In</span>
            </div>
          ) : !isLoggedIn ? (
            <div className="flex items-center gap-1.5 sm:gap-2.5 animate-in fade-in-0 duration-150">
              <Link
                href="/auth/login"
                className="text-xs sm:text-sm font-medium text-foreground hover:text-muted-foreground transition-colors px-2 py-1.5"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="hidden sm:inline-flex rounded-full bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-all shadow-xs"
              >
                Sign Up
              </Link>
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((prev) => !prev)}
                className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-border bg-secondary/80 py-1 pl-1 pr-2 sm:pl-1.5 sm:pr-3 transition-all hover:bg-secondary"
                aria-haspopup="true"
                aria-expanded={accountOpen}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold tracking-tight shrink-0 select-none">
                  {initials}
                </div>
                {shortName && (
                  <span className="hidden sm:block text-xs sm:text-sm font-medium text-foreground max-w-[80px] md:max-w-[100px] truncate">
                    {shortName}
                  </span>
                )}
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                    accountOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {accountOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl z-50">
                  <div className="flex items-center gap-3 border-b border-border px-3 py-3 mb-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                      {initials}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <p className="text-sm font-semibold text-foreground truncate leading-snug">
                        {displayName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate leading-snug">
                        {user?.email}
                      </p>
                      <span className="mt-0.5 inline-flex items-center w-fit rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                        {roleLabel}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    {portalHref && (
                      <Link
                        href={portalHref}
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                      >
                        <PortalIcon className="h-4 w-4 text-foreground" />
                        {portalLabel}
                      </Link>
                    )}

                    <Link
                      href="/account"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <UserIcon className="h-4 w-4 text-muted-foreground" />
                      My Account
                    </Link>

                    <Link
                      href="/order"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Package className="h-4 w-4 text-muted-foreground" />
                      My Orders
                    </Link>

                    <Link
                      href="/wallet"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      My Wallet
                    </Link>

                    <Link
                      href="/wishlist"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Heart className="h-4 w-4 text-muted-foreground" />
                      Saved Wishlist
                    </Link>

                    <Link
                      href={
                        userRole === "admin"
                          ? "/admin/notifications"
                          : userRole === "vendor"
                          ? "/vendor/notifications"
                          : "/account/notifications"
                      }
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Bell className="h-4 w-4 text-muted-foreground" />
                      Notifications
                    </Link>

                    <Link
                      href="/account/setting"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Settings & Security
                    </Link>
                  </div>

                  <div className="border-t border-border my-1 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        setAccountOpen(false);
                        await logout({ redirectTo: "/auth/login" });
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
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
      </div>

    </header>
  );
}
