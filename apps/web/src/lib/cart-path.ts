import type { CartItemResponseDto } from "@/api/dto/cart";
import type { CategoryResponseDto } from "@/api/dto/category";

const CART_ITEM_PATH_STORAGE_KEY = "nuts_cart_item_paths";

export type CartItemOrigin = "CATEGORY_PAGE" | "PRODUCT_PAGE";

export interface StoredItemPath {
  path: string;
  addedFrom: CartItemOrigin;
  timestamp: number;
}

/**
 * Persist the exact origin URL where a product was added from.
 */
export function storeItemAddedPath(
  productId: string,
  path: string,
  addedFrom: CartItemOrigin = "PRODUCT_PAGE"
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CART_ITEM_PATH_STORAGE_KEY);
    const map: Record<string, StoredItemPath> = raw ? JSON.parse(raw) : {};
    map[productId] = {
      path,
      addedFrom,
      timestamp: Date.now(),
    };
    localStorage.setItem(CART_ITEM_PATH_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Graceful fallback if localStorage is disabled or full
  }
}

/**
 * Retrieve the saved origin URL for a product.
 */
export function getStoredItemAddedPath(productId: string): StoredItemPath | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CART_ITEM_PATH_STORAGE_KEY);
    if (!raw) return null;
    const map: Record<string, StoredItemPath> = JSON.parse(raw);
    return map[productId] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the client link for a cart line item:
 * 1. Checks per-item stored client origin path.
 * 2. If addedFrom is "CATEGORY_PAGE", reconstructs hierarchical path from category relations.
 * 3. Otherwise defaults to the clean product catalog path (`/product/${slug}`).
 */
export function resolveCartItemProductHref(
  item: CartItemResponseDto,
  cartAddedFrom?: Record<string, string> | null
): string {
  const stored = getStoredItemAddedPath(item.productId);
  if (stored?.path) {
    return stored.path;
  }

  const addedFromType = stored?.addedFrom || cartAddedFrom?.type;

  if (addedFromType === "CATEGORY_PAGE") {
    // If exact path was saved on cart metadata (e.g. from backend)
    if (cartAddedFrom?.path && typeof cartAddedFrom.path === "string") {
      return cartAddedFrom.path;
    }

    // In a dynamic N-level tree, cart path should be stored, otherwise fallback to product page.
    return `/product/${item.product.slug}`;
  }

  return `/product/${item.product.slug}`;
}

export type CategoryTreeNode = CategoryResponseDto;

export function getNodeChildren(node?: CategoryTreeNode | null): CategoryTreeNode[] {
  if (!node) return [];
  if (Array.isArray(node.children) && node.children.length > 0) return node.children;
  if (Array.isArray(node.subCategories) && node.subCategories.length > 0) return node.subCategories;
  return [];
}

export interface ResolvedCategoryTraversal {
  matchedNode: CategoryTreeNode | null;
  matchedChain: CategoryTreeNode[];
  matchedDepth: number;
  breadcrumbs: { name: string; href: string }[];
  remainingSlugs: string[];
}

export function findCategoryNode(
  slugOrId: string,
  tree: CategoryTreeNode[]
): CategoryTreeNode | null {
  for (const node of tree) {
    if (node.slug === slugOrId || node.id === slugOrId) {
      return node;
    }
    const children = getNodeChildren(node);
    if (children.length > 0) {
      const found = findCategoryNode(slugOrId, children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Traverses an arbitrary depth category hierarchy (1 to 5+ segments) along an array of slugs.
 * Identifies which segments match category nodes and isolates trailing product slug candidates.
 */
export function resolveCategoryPath(
  tree: CategoryResponseDto[],
  slugs: string[]
): ResolvedCategoryTraversal {
  let currentList: CategoryTreeNode[] = tree;
  let matchedNode: CategoryTreeNode | null = null;
  const matchedChain: CategoryTreeNode[] = [];
  let matchedDepth = 0;
  const breadcrumbs: { name: string; href: string }[] = [];
  let pathAcc = "/category";

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const found = currentList.find((c) => c.slug === slug);
    if (!found) {
      break;
    }
    matchedNode = found;
    matchedChain.push(found);
    matchedDepth = i + 1;
    pathAcc += `/${slug}`;
    breadcrumbs.push({ name: found.name, href: pathAcc });
    currentList = getNodeChildren(found);
  }

  // If top-level traversal did not match, check if first segment is a deeper category node
  if (matchedDepth === 0 && slugs.length > 0 && slugs[0]) {
    const deepFound = findCategoryNode(slugs[0], tree);
    if (deepFound) {
      matchedNode = deepFound;
      matchedChain.push(deepFound);
      matchedDepth = 1;
      const fullCrumbs = findCategoryBreadcrumbs(deepFound.id || deepFound.slug || "", tree);
      if (fullCrumbs && fullCrumbs.length > 0) {
        breadcrumbs.push(...fullCrumbs);
      } else {
        breadcrumbs.push({ name: deepFound.name, href: `/category/${deepFound.slug}` });
      }
      return {
        matchedNode,
        matchedChain,
        matchedDepth,
        breadcrumbs,
        remainingSlugs: slugs.slice(1),
      };
    }
  }

  // Ensure full breadcrumb path is resolved even when arriving at leaf
  if (matchedNode && breadcrumbs.length === 1 && slugs.length === 1) {
    const fullAncestry = findCategoryBreadcrumbs(matchedNode.id || matchedNode.slug, tree);
    if (fullAncestry && fullAncestry.length > breadcrumbs.length) {
      breadcrumbs.length = 0;
      breadcrumbs.push(...fullAncestry);
    }
  }

  return {
    matchedNode,
    matchedChain,
    matchedDepth,
    breadcrumbs,
    remainingSlugs: slugs.slice(matchedDepth),
  };
}

/**
 * Recursively searches the category tree for a category by slug or id,
 * and returns its full canonical URL path (e.g. `/category/beauty/bath-and-body`).
 */
export function findCategoryFullPath(
  slugOrId: string,
  tree: CategoryTreeNode[],
  currentPath = "/category"
): string | null {
  for (const node of tree) {
    const nodePath = `${currentPath}/${node.slug}`;
    if (node.slug === slugOrId || node.id === slugOrId) {
      return nodePath;
    }
    const children = getNodeChildren(node);
    if (children.length > 0) {
      const found = findCategoryFullPath(slugOrId, children, nodePath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recursively searches the category tree for a category by slug or id,
 * and builds the complete breadcrumb ancestor chain with canonical hrefs.
 * e.g. [ { name: "Fashion", href: "/category/fashion" },
 *        { name: "Menswear", href: "/category/fashion/menswear" },
 *        { name: "Shirts", href: "/category/fashion/menswear/shirts" } ]
 */
export function findCategoryBreadcrumbs(
  slugOrId: string,
  tree: CategoryTreeNode[],
  currentPath = "/category",
  accumulated: { name: string; href: string }[] = []
): { name: string; href: string }[] | null {
  for (const node of tree) {
    const nodePath = `${currentPath}/${node.slug}`;
    const nextAcc = [...accumulated, { name: node.name, href: nodePath }];
    if (node.slug === slugOrId || node.id === slugOrId) {
      return nextAcc;
    }
    const children = getNodeChildren(node);
    if (children.length > 0) {
      const found = findCategoryBreadcrumbs(slugOrId, children, nodePath, nextAcc);
      if (found) return found;
    }
  }
  return null;
}
