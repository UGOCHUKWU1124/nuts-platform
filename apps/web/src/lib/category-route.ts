import type { CategoryResponseDto } from "@/api/dto/category";
import type { ResolvedCategoryTraversal } from "@/lib/cart-path";

export type CategoryRouteResolution =
  | {
      kind: "category";
      category: CategoryResponseDto;
      categorySlugs: string[];
    }
  | {
      kind: "product";
      category: CategoryResponseDto;
      categorySlugs: string[];
      productSlug: string;
    }
  | { kind: "not-found" };

export function resolveCategoryRoute(
  traversal: ResolvedCategoryTraversal,
  slugs: string[],
): CategoryRouteResolution {
  if (!slugs.length) return { kind: "not-found" };

  if (!traversal.matchedNode) return { kind: "not-found" };

  if (traversal.remainingSlugs.length === 0) {
    return {
      kind: "category",
      category: traversal.matchedNode,
      categorySlugs: slugs,
    };
  }

  if (traversal.remainingSlugs.length === 1) {
    const productSlug = traversal.remainingSlugs[0];
    if (!productSlug) return { kind: "not-found" };
    return {
      kind: "product",
      category: traversal.matchedNode,
      categorySlugs: slugs.slice(0, traversal.matchedDepth),
      productSlug,
    };
  }

  return { kind: "not-found" };
}
