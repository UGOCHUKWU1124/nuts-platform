"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import type { CategoryResponseDto } from "@/api/dto/category";
import { getNodeChildren } from "@/lib/cart-path";
import {
ChevronRight
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { usePathname } from "next/navigation";
import { useEffect,useRef,useState } from "react";

export function CategoryNavMenu({
  categories: propCategories = [],
}: {
  categories?: CategoryResponseDto[];
} = {}) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const isOpen = openPath === pathname;
  const [hoveredRootId, setHoveredRootId] = useState<string | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const allCategories = propCategories;
  const rootCategories = allCategories.filter((category) => !category.parentId);

  // Clear hover timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Smooth hover handlers with small debounce
  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpenPath(pathname);
  };

  const handleMouseLeave = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setOpenPath(null);
    }, 200);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenPath(null);
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const activeRoot =
    rootCategories.find((c) => c.id === hoveredRootId) ?? rootCategories[0] ?? null;

  const rootChildren = getNodeChildren(activeRoot);
  const hasParentSubcategories = rootChildren.some(
    (c) => c.level === "PARENT_SUBCATEGORY" || getNodeChildren(c).length > 0
  );

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 3-Lines Sleek Toggle Button */}
      <button
        type="button"
        onClick={() => setOpenPath(isOpen ? null : pathname)}
        aria-label="Browse categories"
        aria-expanded={isOpen}
        className="group relative flex h-9.5 w-9.5 items-center justify-center rounded-xl bg-transparent text-foreground transition-all duration-200 hover:bg-secondary/80 focus:outline-hidden cursor-pointer"
      >
        <div className="flex flex-col items-start justify-center gap-1.5 w-4">
          <span
            className={`h-0.5 rounded-full bg-foreground transition-all duration-300 ${
              isOpen ? "w-4 rotate-45 translate-y-2" : "w-4"
            }`}
          />
          <span
            className={`h-0.5 rounded-full bg-foreground transition-all duration-200 ${
              isOpen ? "opacity-0 w-0" : "w-2.5 group-hover:w-4"
            }`}
          />
          <span
            className={`h-0.5 rounded-full bg-foreground transition-all duration-300 ${
              isOpen ? "w-4 -rotate-45 -translate-y-2" : "w-3.5 group-hover:w-4"
            }`}
          />
        </div>
      </button>

      {/* Flyout Mega Menu & Backdrop */}
      {isOpen && (
        <>
          {/* Backdrop Blur Overlay */}
          <div
            className="fixed inset-0 top-16 bg-black/30 backdrop-blur-xs z-40 transition-opacity animate-in fade-in-50 duration-200"
            onClick={() => setOpenPath(null)}
            aria-hidden="true"
          />

          {/* Borderless, Simple, Slick Cascading Menu */}
          <div
            className="fixed top-16 left-0 right-0 sm:left-4 sm:right-auto sm:max-w-3xl lg:max-w-4xl z-50 overflow-hidden rounded-2xl bg-card/95 backdrop-blur-2xl text-card-foreground shadow-2xl animate-in fade-in-50 slide-in-from-top-2 duration-200"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="flex flex-col md:flex-row max-h-[75vh] overflow-y-auto">
              {/* Column 1: Root Categories */}
              <div className="w-full md:w-56 shrink-0 p-4 bg-secondary/30">
                <div className="flex flex-col gap-1">
                  {rootCategories.map((category) => {
                    const isSelected = activeRoot?.id === category.id;

                    return (
                      <div
                        key={category.id}
                        onMouseEnter={() => setHoveredRootId(category.id)}
                        className="relative"
                      >
                        <Link
                          href={`/category/${category.slug}`}
                          onClick={() => setOpenPath(null)}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-all ${
                            isSelected
                              ? "bg-foreground text-background font-bold shadow-xs"
                              : "text-foreground hover:bg-secondary/70 font-medium"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {category.imageUrl ? (
                              <RemoteImage
                                src={category.imageUrl}
                                alt={category.name}
                                className="h-4 w-4 shrink-0 object-contain"
                              />
                            ) : (
                              <span className="text-xs font-bold w-4 text-center">{category.name.charAt(0)}</span>
                            )}
                            <span>{category.name}</span>
                          </div>

                          <ChevronRight
                            className={`h-3.5 w-3.5 transition-transform ${
                              isSelected ? "text-background translate-x-0.5" : "text-muted-foreground opacity-60"
                            }`}
                          />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Column 2: Slick Borderless Subcategories */}
              <div className="flex-1 p-6 overflow-y-auto">
                {activeRoot ? (
                  <div>
                    {/* Active Category Title */}
                    <div className="mb-5">
                      <Link
                        href={`/category/${activeRoot.slug}`}
                        onClick={() => setOpenPath(null)}
                        className="text-2xl font-bold tracking-tight text-foreground hover:text-primary transition-colors"
                      >
                        {activeRoot.name}
                      </Link>
                    </div>

                    {/* Subcategories Breakdown: clean, borderless, slick */}
                    {hasParentSubcategories ? (
                      /* Root has Parent-Subcategories (e.g. Womenswear & Menswear) */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        {rootChildren.map((parentSub) => {
                          const subcategories = getNodeChildren(parentSub);

                          return (
                            <div key={parentSub.id} className="space-y-3">
                              {/* Parent Subcategory Header */}
                              <div>
                                <Link
                                  href={`/category/${activeRoot.slug}/${parentSub.slug}`}
                                  onClick={() => setOpenPath(null)}
                                  className="text-lg font-semibold text-foreground hover:text-primary transition-colors inline-block"
                                >
                                  {parentSub.name}
                                </Link>
                              </div>

                              {/* Leaf Subcategories list: borderless, simple */}
                              {subcategories.length > 0 ? (
                                <div className="flex flex-col gap-1.5">
                                  {subcategories.map((sub) => (
                                    <Link
                                      key={sub.id}
                                      href={`/category/${activeRoot.slug}/${parentSub.slug}/${sub.slug}`}
                                      onClick={() => setOpenPath(null)}
                                      className="text-sm font-medium text-muted-foreground hover:text-foreground hover:translate-x-1 transition-all py-0.5"
                                    >
                                      {sub.name}
                                    </Link>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : rootChildren.length > 0 ? (
                      /* Root has Direct Subcategories (No Parent-Sub tier) */
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {rootChildren.map((sub) => (
                          <Link
                            key={sub.id}
                            href={`/category/${activeRoot.slug}/${sub.slug}`}
                            onClick={() => setOpenPath(null)}
                            className="rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/70 transition-colors"
                          >
                            {sub.name}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
