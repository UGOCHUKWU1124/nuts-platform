import { api } from "@/api/core/client";
import type {
AddedFromType,
CartItemResponseDto,
CartResponseDto,
DiscountPreviewDto,
} from "@/api/dto/cart";

export interface AddToCartPayload {
  quantity?: number;
  variantId?: string;
  addedFrom?: AddedFromType;
}

export interface UpdateCartItemPayload {
  quantity: number;
  variantId?: string;
}

export const cartService = {
  get() {
    return api.get<CartResponseDto>("/cart");
  },
  addItem(productId: string, payload: AddToCartPayload = {}) {
    return api.post<CartItemResponseDto | CartResponseDto>(
      `/cart/items/${productId}`,
      payload
    );
  },
  updateItem(productId: string, payload: UpdateCartItemPayload) {
    return api.patch<CartResponseDto>(`/cart/items/${productId}`, payload);
  },
  removeItem(productId: string, variantId?: string) {
    return api.delete<CartResponseDto>(`/cart/items/${productId}`, {
      params: variantId ? { variantId } : {},
    });
  },
  clear() {
    return api.delete<void>("/cart");
  },
  previewDiscount(code: string) {
    return api.get<DiscountPreviewDto>(`/cart/discount-preview?code=${encodeURIComponent(code)}`);
  },
};