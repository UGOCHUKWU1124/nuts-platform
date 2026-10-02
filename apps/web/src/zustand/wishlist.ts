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
};

export interface WishlistProduct {
  id: string;
  productId: string;
  name: string;
  slug: string;
  price: number;
  image?: string | null;
  vendorStore?: string | null;
}

interface WishlistState {
  items: WishlistProduct[];
  addItem: (product: WishlistStoreProduct) => void;
  removeItem: (productId: string) => void;
  toggleItem: (product: WishlistStoreProduct) => boolean;
  isInWishlist: (productId: string) => boolean;
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

      addItem: (product) => {
        const items = get().items;
        if (items.some((i) => i.productId === product.id || i.id === product.id)) {
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
              id: product.id,
              productId: product.id,
              name: product.name,
              slug: product.slug,
              price: Number(product.discountPrice ?? product.price ?? 0),
              image: img,
              vendorStore: product.vendor?.storeName,
            },
          ],
        });
      },

      removeItem: (productId) => {
        set({
          items: get().items.filter(
            (item) => item.productId !== productId && item.id !== productId
          ),
        });
      },

      toggleItem: (product) => {
        const inWishlist = get().isInWishlist(product.id);

        if (inWishlist) {
          get().removeItem(product.id);
          return false;
        }

        get().addItem(product);
        return true;
      },

      isInWishlist: (productId) =>
        get().items.some((item) => item.productId === productId || item.id === productId),

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
