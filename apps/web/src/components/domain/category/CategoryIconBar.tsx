"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import type { CategoryResponseDto } from "@/api/dto/category";
import Link from "next/link";

interface CategoryIconBarProps {
  categories?: CategoryResponseDto[];
}

export function CategoryIconBar({ categories = [] }: CategoryIconBarProps) {
  // Filter strictly to root categories (CATEGORY level / no parent)
  const rootCategories = categories.filter((c) => !c.parentId || c.level === 'CATEGORY');

  if (rootCategories.length === 0) {
    return null;
  }

  return (
    <div className="w-full border-b border-border bg-background py-6 transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-6 sm:gap-10 overflow-x-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {rootCategories.map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              prefetch={false}
              className="group flex flex-col items-center gap-2.5 shrink-0 text-center transition-transform hover:-translate-y-0.5"
            >
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-secondary/60 border border-border/60 transition-all duration-200 group-hover:scale-105 group-hover:bg-secondary group-hover:border-primary/40 shadow-2xs overflow-hidden p-2.5">
                {category.imageUrl ? (
                  <RemoteImage
                    src={category.imageUrl}
                    alt={category.name}
                    className="h-full w-full object-contain transition-transform group-hover:scale-110"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-sm font-bold text-foreground/80 group-hover:text-primary">
                    {category.name.charAt(0)}
                  </span>
                )}
              </div>
              <span className="text-xs sm:text-sm font-semibold text-foreground/90 group-hover:text-primary transition-colors">
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
