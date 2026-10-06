"use client";

import { Button } from "@/component/ui/button";
import { cn } from "@/lib/util";
import { useAuthStore } from "@/zustand/auth";
import {
BarChart3,
ChevronRight,
ExternalLink,
Layers,
LogOut,
Package,
Settings,
ShoppingCart,
Tag,
UserCheck,
Users,
X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { usePathname } from "next/navigation";
import { type ReactNode,useState } from "react";
import { AdminHeader } from "./AdminHeader";

interface NavGroup {
  group: string;
  items: {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: string;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: "OVERVIEW",
    items: [
      { href: "/admin/analytic", label: "Analytics & KPI", icon: BarChart3 },
      { href: "/admin/setting", label: "System & Cache", icon: Settings },
    ],
  },
  {
    group: "COMMERCE",
    items: [
      { href: "/admin/product", label: "Products", icon: Package },
      { href: "/admin/category", label: "Categories", icon: Layers },
      { href: "/admin/order", label: "Orders", icon: ShoppingCart },
      { href: "/admin/discount", label: "Discounts", icon: Tag },
    ],
  },
  {
    group: "MEMBERSHIP",
    items: [
      { href: "/admin/vendor", label: "Vendors & Stores", icon: UserCheck },
      { href: "/admin/user", label: "User Directory", icon: Users },
    ],
  },
];

export function AdminLayout({ children }: { children: ReactNode }) {
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

      {/* Admin Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,95vw)] flex-col border-r border-border bg-card text-card-foreground shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-18 items-center justify-between border-b border-border px-6">
          <Link href="/admin/analytic" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-xs transition-transform group-hover:scale-105">
              N
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
                NUTS <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border font-semibold uppercase tracking-wider">ADMIN</span>
              </span>
              <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-1">
                Enterprise Command
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5 [scrollbar-width:none]">
          {NAV_GROUPS.map((group) => (
            <div key={group.group} className="space-y-1.5">
              <p className="px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {group.group}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
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
                        <item.icon className={cn(
                          "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
                          isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                        )} />
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
              </div>
            </div>
          ))}
        </nav>

        {/* Live System Indicator & Sign Out */}
        <div className="px-4 py-3 border-t border-border bg-card">
          <div className="flex items-center justify-between text-xs mb-2 px-1">
            <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Engine Online
            </span>
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              Storefront <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors h-10"
            onClick={() => logout({ redirectTo: "/auth/admin/login" })}
          >
            <LogOut className="h-4 w-4" />
            Sign Out of Admin
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col transition-all lg:ml-72">
        <AdminHeader onMobileMenuClick={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 p-3 min-[360px]:p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
