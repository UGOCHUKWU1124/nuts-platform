import type { WishlistResponseDto } from "@/api/dto/wishlist";
import { wishlistService } from "@/api/wishlist";
import { queryKey } from "@/lib/query-key";
import { useAuthStore } from "@/zustand/auth";
import { useWishlistStore } from "@/zustand/wishlist";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { useCallback,useEffect } from "react";
import { toast } from "sonner";

type WishlistToggleProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  discountPrice?: number | null;
  thumbnail?: string | null;
  images?: Array<{ url?: string } | string>;
  vendor?: { storeName?: string; storeSlug?: string; isVerified?: boolean };
};

// Simple view item type matching what the page expects
export type WishlistViewItem = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  price: number;
  image?: string | null;
  vendorStore?: string | null;
  variantId?: string | null;
};

const mapServerItem = (item: WishlistResponseDto): WishlistViewItem => ({
  id: item.id, // Use the actual wishlist item ID from server
  productId: item.productId,
  name: item.productName,
  slug: item.productSlug,
  price: Number(item.productPrice ?? 0),
  image: item.productImage ?? null,
  vendorStore: undefined,
  variantId: item.variantId ?? null,
});

export function useWishlist(initialData?: WishlistResponseDto[]) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const guestItems = useWishlistStore((state) => state.items);

  // Fetch wishlist from server for all authenticated users
  const { data: serverItems, isLoading, error } = useQuery<WishlistResponseDto[]>({
    queryKey: queryKey.wishlist,
    queryFn: async () => (await wishlistService.list()).data,
    enabled: isAuthenticated,
    initialData: initialData ?? undefined,
    staleTime: 1000 * 60 * 15,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Show error if fetch fails (inside effect, not during render)
  useEffect(() => {
    if (error) {
      toast.error("Failed to load wishlist");
    }
  }, [error]);

  // Map server items to view items, or use guest items for unauthenticated users
  const items: WishlistViewItem[] = isAuthenticated
    ? (serverItems ?? []).map(mapServerItem)
    : guestItems;

  // Check if a product is in the wishlist
  const isInWishlist = useCallback(
    (productId: string, variantId?: string) => {
      if (isAuthenticated) {
        return (serverItems ?? []).some(
          (item) =>
            item.productId === productId &&
            (!variantId || item.variantId === variantId)
        );
      }
      return guestItems.some((item) => item.productId === productId);
    },
    [guestItems, isAuthenticated, serverItems]
  );

  // Remove item mutation - simple and clean
  const removeItemMutation = useMutation({
    mutationFn: async ({
      productId,
      variantId,
    }: {
      productId: string;
      variantId?: string;
    }) => {
      if (!isAuthenticated) {
        useWishlistStore.getState().removeItem(productId);
        return;
      }
      await wishlistService.remove(productId, variantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey.wishlist });
      toast.info("Removed from wishlist");
    },
    onError: (error) => {
      toast.error(
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Unable to remove item"
      );
    },
  });

  // Toggle item mutation - simple and clean
  const toggleItemMutation = useMutation({
    mutationFn: async ({
      product,
      variantId,
      shouldAdd,
    }: {
      product: WishlistToggleProduct;
      variantId?: string;
      shouldAdd: boolean;
    }) => {
      // Handle guest users with local store
      if (!isAuthenticated) {
        useWishlistStore.getState().toggleItem(product);
        return shouldAdd;
      }

      if (shouldAdd) {
        await wishlistService.add(product.id, variantId);
        return true;
      }
      await wishlistService.remove(product.id, variantId);
      return false;
    },
    onMutate: async ({ product, variantId, shouldAdd }) => {
      if (!isAuthenticated) return undefined;

      await queryClient.cancelQueries({ queryKey: queryKey.wishlist });
      const previous = queryClient.getQueryData<WishlistResponseDto[]>(queryKey.wishlist);
      const current = previous ?? [];
      const firstImage = product.images?.[0];
      const productImage = product.thumbnail ?? (
        typeof firstImage === "string" ? firstImage : firstImage?.url
      ) ?? null;

      const isTarget = (item: WishlistResponseDto) =>
        item.productId === product.id && (item.variantId ?? null) === (variantId ?? null);
      const next = shouldAdd
        ? [
            ...current.filter((item) => !isTarget(item)),
            {
              id: `optimistic:${product.id}:${variantId ?? "product"}`,
              productId: product.id,
              variantId: variantId ?? null,
              productName: product.name,
              productSlug: product.slug,
              productPrice: Number(product.price ?? 0),
              productImage,
              createdAt: new Date(),
            },
          ]
        : current.filter((item) => !isTarget(item));

      queryClient.setQueryData(queryKey.wishlist, next);
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey.wishlist, context.previous);
      } else if (context) {
        queryClient.removeQueries({ queryKey: queryKey.wishlist, exact: true });
      }
      toast.error(
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Unable to update wishlist"
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKey.wishlist });
    },
  });

  // Simple clear wishlist
  const clearWishlist = useCallback(async () => {
    if (!isAuthenticated) {
      useWishlistStore.getState().clearWishlist();
      return;
    }

    const itemsToRemove = serverItems ?? [];
    await Promise.all(
      itemsToRemove.map((item) =>
        wishlistService.remove(item.productId, item.variantId ?? undefined)
      )
    );
    queryClient.invalidateQueries({ queryKey: queryKey.wishlist });
  }, [isAuthenticated, serverItems, queryClient]);

  return {
    items,
    count: items.length,
    isLoading,
    isTogglePending: toggleItemMutation.isPending,
    isInWishlist,
    removeItem: (productId: string, variantId?: string) =>
      removeItemMutation.mutate({ productId, variantId }),
    toggleItem: (product: WishlistToggleProduct, variantId?: string) =>
      toggleItemMutation.mutateAsync({
        product,
        variantId,
        shouldAdd: !isInWishlist(product.id, variantId),
      }),
    clearWishlist,
  };
}
