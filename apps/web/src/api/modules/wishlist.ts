import { api } from "@/api/core/client";
import type { WishlistResponseDto } from "@/api/dto/wishlist";

export const wishlistService = {
  list() {
    return api.get<WishlistResponseDto[]>("/wishlist");
  },
  add(productId: string, variantId?: string) {
    return api.post<WishlistResponseDto>(
      `/wishlist/items/${productId}`,
      variantId ? { variantId } : {}
    );
  },
  remove(productId: string, variantId?: string) {
    return api.delete<void>(`/wishlist/items/${productId}`, {
      params: variantId ? { variantId } : {},
    });
  },
};