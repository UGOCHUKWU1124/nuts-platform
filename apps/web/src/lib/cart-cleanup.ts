import type { QueryClient } from "@tanstack/react-query";
import { queryKey } from "@/lib/query-key";
import { useCartStore } from "@/zustand/cart";

/**
 * Enterprise client-side cart cleanup helper.
 *
 * Automatically purges optimistic items, React Query cache, and
 * stored checkout drafts when a shopper transitions to the payment gateway.
 */
export function clearClientCart(queryClient?: QueryClient): void {
  // 1. Immediately reset React Query cache to an empty cart representation
  if (queryClient) {
    queryClient.setQueryData(queryKey.cart, {
      id: "",
      cart: {
        id: "",
        userId: "",
        subtotal: 0,
        discountAmount: 0,
        deliveryCharge: 0,
        serviceCharge: 0,
        totalAmount: 0,
        totalItemCount: 0,
        abandonedCartAlerted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        checkedOut: false,
      },
      cartItems: [],
    });
    queryClient.invalidateQueries({ queryKey: queryKey.cart });
    queryClient.removeQueries({ queryKey: queryKey.cart });
  }

  // 2. Clear Zustand optimistic cart state
  try {
    useCartStore.getState().clearOptimisticCart();
  } catch {}

  // 3. Clear applied discount code and transient checkout snapshots
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("nuts_applied_discount");
      window.localStorage.removeItem("nuts_cart_snapshot");
    }
  } catch {}
}
