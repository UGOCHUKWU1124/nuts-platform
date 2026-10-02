"use client";

import { Button } from "@/component/ui/button";
import { cn } from "@/lib/util";
import { useAuthStore } from "@/zustand/auth";
import {
BarChart3,
ChevronRight,
LogOut,
Package,
Settings,
ShoppingBag,
Tag,
Wallet,
X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode,useState } from "react";
import { VendorHeader } from "./VendorHeader";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/vendor/analytic", label: "Analytics & Sales", icon: BarChart3 },
  { href: "/vendor/product", label: "Product Catalog", icon: Package },
  { href: "/vendor/order", label: "Customer Orders", icon: ShoppingBag },
  { href: "/vendor/wallet", label: "Wallet & Payouts", icon: Wallet },
  { href: "/vendor/discount", label: "Discount Coupons", icon: Tag },
  { href: "/vendor/setting", label: "Store Settings", icon: Settings },
];

export function VendorLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuthStore();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen min-w-0 bg-background font-sans text-foreground">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Vendor Store Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,95vw)] flex-col border-r border-border bg-card text-card-foreground shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-18 items-center justify-between border-b border-border px-6">
          <Link href="/vendor/analytic" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-xs transition-transform group-hover:scale-105">
              N
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
                NUTS <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border font-semibold uppercase tracking-wider">VENDOR</span>
              </span>
              <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-1">
                Vendor Portal
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5 [scrollbar-width:none]">
          <p className="px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Store Management
          </p>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
                      isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  <span>{item.label}</span>
                </div>

                {isActive ? (
                  <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-muted-foreground" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out & Footer */}
        <div className="px-4 py-3 border-t border-border bg-card">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors h-10"
            onClick={() => logout({ redirectTo: "/auth/vendor/login" })}
          >
            <LogOut className="h-4 w-4" />
            Sign Out of Store
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col transition-all lg:ml-72">
        <VendorHeader onMobileMenuClick={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 p-3 min-[360px]:p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
