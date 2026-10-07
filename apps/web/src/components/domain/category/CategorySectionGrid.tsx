import type { CategoryResponseDto } from "@/api/dto/category";
import { RemoteImage } from "@/component/ui/RemoteImage";
import Link from "@/components/navigation/AppLink";
import { ChevronRight, ShoppingBag } from "lucide-react";

interface CategorySectionGridProps {
  categories: CategoryResponseDto[];
  parentPath: string;
}

export function CategorySectionGrid({
  categories,
  parentPath,
}: CategorySectionGridProps) {
  if (categories.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`${parentPath.replace(/\/+$/, "")}/${encodeURIComponent(category.slug)}`}
          className="group overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/50 hover:bg-secondary/30"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
            {category.imageUrl ? (
              <RemoteImage
                src={category.imageUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground/50">
                <ShoppingBag className="h-8 w-8 stroke-[1.2]" />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground sm:text-base">
                {category.name}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {typeof category.childrenCount === "number"
                  ? `${category.childrenCount} ${
                      category.childrenCount === 1 ? "collection" : "collections"
                    }`
                  : typeof category.productCount === "number"
                    ? `${category.productCount} ${
                        category.productCount === 1 ? "product" : "products"
                      }`
                    : "Browse collection"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      ))}
    </div>
  );
}
