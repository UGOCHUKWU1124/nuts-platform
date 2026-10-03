import { create } from "zustand";
import { createJSONStorage,persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

type WishlistStoreProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  discountPrice?: number | null;
  thumbnail?: string | null;
  images?: Array<{ url?: string } | string>;
  vendor?: { storeName?: string; storeSlug?: string; isVerified?: boolean };
  variantId?: string | null;
  variantName?: string | null;
};

export interface WishlistProduct {
  id: string;
  productId: string;
  name: string;
  slug: string;
  price: number;
  image?: string | null;
  vendorStore?: string | null;
  variantId?: string | null;
  variantName?: string | null;
}

interface WishlistState {
  items: WishlistProduct[];
  addItem: (product: WishlistStoreProduct, variantId?: string | null) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  toggleItem: (product: WishlistStoreProduct, variantId?: string | null) => boolean;
  isInWishlist: (productId: string, variantId?: string | null) => boolean;
  clearWishlist: () => void;
  count: () => number;
}

const dummyStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const persistConfig = {
  name: "nuts-wishlist-storage",
  storage: createJSONStorage(() =>
    typeof window !== "undefined" ? window.localStorage : dummyStorage
  ),
};

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, variantId) => {
        const items = get().items;
        const targetVariantId = variantId ?? product.variantId ?? null;
        if (
          items.some(
            (i) =>
              i.productId === product.id &&
              (targetVariantId ? i.variantId === targetVariantId : true)
          )
        ) {
          return;
        }

        const img =
          product.images?.[0] && typeof product.images[0] === "object"
            ? "url" in product.images[0]
              ? product.images[0].url
              : undefined
            : product.thumbnail;

        set({
          items: [
            ...items,
            {
              id: `${product.id}${targetVariantId ? `:${targetVariantId}` : ""}`,
              productId: product.id,
              name: product.name,
              slug: product.slug,
              price: Number(product.discountPrice ?? product.price ?? 0),
              image: img,
              vendorStore: product.vendor?.storeName,
              variantId: targetVariantId,
              variantName: product.variantName ?? null,
            },
          ],
        });
      },

      removeItem: (productId, variantId) => {
        set({
          items: get().items.filter((item) => {
            if (item.productId !== productId && item.id !== productId) return true;
            if (variantId && item.variantId && item.variantId !== variantId) return true;
            return false;
          }),
        });
      },

      toggleItem: (product, variantId) => {
        const targetVariantId = variantId ?? product.variantId ?? null;
        const inWishlist = get().isInWishlist(product.id, targetVariantId);

        if (inWishlist) {
          get().removeItem(product.id, targetVariantId);
          return false;
        }

        get().addItem(product, targetVariantId);
        return true;
      },

      isInWishlist: (productId, variantId) =>
        get().items.some(
          (item) =>
            (item.productId === productId || item.id === productId) &&
            (!variantId || !item.variantId || item.variantId === variantId)
        ),

      clearWishlist: () => set({ items: [] }),

      count: () => get().items.length,
    }),
    persistConfig
  )
);

export function hydrateWishlistStore(isAuthenticated: boolean) {
  if (!isAuthenticated) {
    useWishlistStore.persist.rehydrate();
  }
}

export function clearWishlistOnLogout() {
  useWishlistStore.getState().clearWishlist();
}
