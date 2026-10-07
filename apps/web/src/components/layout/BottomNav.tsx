"use client";

import { useHydrated } from "../../hook/use-hydrated";
import { useCart } from "@/hook/use-cart";
import { useWishlist } from "@/hook/use-wishlist";
import { Heart,Home,Package,ShoppingBag,Store } from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/component/notification/NotificationBell";
import { useAuthStore } from "@/zustand/auth";
import { VENDOR_PORTAL_PATHS } from "@/lib/portal-role";

export function BottomNav() {
  const pathname = usePathname();
  const isMounted = useHydrated();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { count: cartCount } = useCart();
  const { count: wishlistCount } = useWishlist();
  const isVendorPortalRoute = VENDOR_PORTAL_PATHS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // Do not render bottom nav on admin, vendor, or checkout screens to avoid clashing with forms/flows
  if (pathname.startsWith("/admin") || isVendorPortalRoute || pathname.startsWith("/checkout")) {
    return null;
  }

  const isHome = pathname === "/";
  const isProducts = pathname.startsWith("/product");
  const isVendors = pathname === "/vendor" || pathname.startsWith("/vendor/");
  const isWishlist = pathname.startsWith("/wishlist");
  const isCart = pathname.startsWith("/cart");
  return (
    <nav
      aria-label="Mobile Navigation"
      className="xl:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-lg pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.2)]"
    >
      <div
        className={`mx-auto grid max-w-xl items-center px-1 sm:px-2 ${
          isMounted && isAuthenticated ? "grid-cols-6" : "grid-cols-5"
        }`}
      >
        {/* Home */}
        <Link
          href="/"
          className={`flex min-h-11 flex-col items-center justify-center py-1 transition-colors ${
            isHome ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="relative">
            <Home className={`h-5 w-5 ${isHome ? "stroke-[2.2]" : "stroke-[1.6]"}`} />
          </div>
          <span className="text-[10px] tracking-tight mt-1">Home</span>
        </Link>

        {/* Products */}
        <Link
          href="/product"
          className={`flex min-h-11 flex-col items-center justify-center py-1 transition-colors ${
            isProducts ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="relative">
            <Package className={`h-5 w-5 ${isProducts ? "stroke-[2.2]" : "stroke-[1.6]"}`} />
          </div>
          <span className="text-[10px] tracking-tight mt-1">Products</span>
        </Link>

        {/* Vendors */}
        <Link
          href="/vendor"
          aria-current={isVendors ? "page" : undefined}
          className={`flex min-h-11 flex-col items-center justify-center py-1 transition-colors ${
            isVendors ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Store className={`h-5 w-5 ${isVendors ? "stroke-[2.2]" : "stroke-[1.6]"}`} />
          <span className="mt-1 text-[10px] tracking-tight">Vendors</span>
        </Link>

        {/* Notifications */}
        {isMounted && isAuthenticated && <NotificationBell placement="bottom" />}

        {/* Wishlist */}
        <Link
          href="/wishlist"
          className={`flex min-h-11 flex-col items-center justify-center py-1 transition-colors ${
            isWishlist ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="relative">
            <Heart className={`h-5 w-5 ${isWishlist ? "fill-primary text-primary stroke-[2]" : "stroke-[1.6]"}`} />
            {isMounted && wishlistCount > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {wishlistCount > 99 ? "99+" : wishlistCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-1">Wishlist</span>
        </Link>

        {/* Cart */}
        <Link
          href="/cart"
          className={`flex min-h-11 flex-col items-center justify-center py-1 transition-colors ${
            isCart ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="relative">
            <ShoppingBag className={`h-5 w-5 ${isCart ? "stroke-[2.2]" : "stroke-[1.6]"}`} />
            {isMounted && cartCount > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-1">Cart</span>
        </Link>
      </div>
    </nav>
  );
}
