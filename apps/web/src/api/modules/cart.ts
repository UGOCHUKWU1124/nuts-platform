import { api } from "@/api/core/client";
import type {
AddToCartResponseDto,
AddedFromType,
CartResponseDto,
DiscountPreviewDto,
RemoveCartItemResponseDto,
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
    return api.post<AddToCartResponseDto>(
      `/cart/items/${productId}`,
      payload
    );
  },
  updateItem(productId: string, payload: UpdateCartItemPayload) {
    return api.patch<CartResponseDto>(`/cart/items/${productId}`, payload);
  },
  removeItem(productId: string, variantId?: string) {
    return api.delete<RemoveCartItemResponseDto>(`/cart/items/${productId}`, {
      params: variantId ? { variantId } : {},
    });
  },
  clear() {
    return api.delete<CartResponseDto>("/cart");
  },
  previewDiscount(code: string) {
    return api.get<DiscountPreviewDto>(`/cart/discount-preview?code=${encodeURIComponent(code)}`);
  },
};