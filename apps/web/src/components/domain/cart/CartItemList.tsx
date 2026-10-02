"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import { cartService } from "@/api";
import type { CartItemResponseDto,CartResponseDto } from "@/api/dto/cart";
import { Button } from "@/component/ui/button";
import { Card,CardContent } from "@/component/ui/card";
import { resolveCartItemProductHref } from "@/lib/cart-path";
import { queryKey } from "@/lib/query-key";
import { formatPrice } from "@/lib/util";
import { useMutation,useQueryClient } from "@tanstack/react-query";
import { Minus,Plus,ShoppingBag,Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export function CartItemList({
  items,
  cartAddedFrom,
}: {
  items: CartItemResponseDto[];
  cartAddedFrom?: Record<string, string> | null;
}) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKey.cart });

  const updateItem = useMutation({
    mutationFn: ({ productId, delta, variantId }: { productId: string; delta: number; variantId?: string }) =>
      cartService.updateItem(productId, { quantity: delta, ...(variantId ? { variantId } : {}) }),
    onMutate: async ({ productId, delta, variantId }) => {
      await qc.cancelQueries({ queryKey: queryKey.cart });
      const previous = qc.getQueryData<CartResponseDto>(queryKey.cart);
      qc.setQueryData<CartResponseDto>(queryKey.cart, (current) => {
        if (!current) return current;
        const target = current.cartItems.find((line) => line.productId === productId && line.variant?.id === variantId);
        if (!target) return current;
        const nextQuantity = target.quantity + delta;
        const cartItems =
          nextQuantity <= 0
            ? current.cartItems.filter((line) => line !== target)
            : current.cartItems.map((line) => (line === target ? { ...line, quantity: nextQuantity } : line));
        return {
          ...current,
          cartItems,
          cart: {
            ...current.cart,
            totalItemCount: Math.max(0, current.cart.totalItemCount + delta),
            subtotal: Math.max(0, current.cart.subtotal + target.price * delta),
            totalAmount: Math.max(0, current.cart.totalAmount + target.price * delta),
          },
        };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => qc.setQueryData(queryKey.cart, context?.previous),
    onSettled: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: ({ productId, variantId }: { productId: string; variantId?: string }) =>
      cartService.removeItem(productId, variantId),
    onSuccess: () => {
      invalidate();
      toast.success("Item removed from cart");
    },
  });

  const clearCart = useMutation({
    mutationFn: () => cartService.clear(),
    onSuccess: () => {
      invalidate();
      toast.success("Cart cleared");
    },
  });

  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const productHref = resolveCartItemProductHref(item, cartAddedFrom);
        return (
          <Card key={item.id} className="rounded-2xl border-border/70 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Link
                  href={productHref}
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary/50 flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  {item.product.images?.[0]?.url ? (
                    <RemoteImage
                      src={item.product.images[0].url}
                      alt={item.product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={productHref} className="block hover:text-primary transition-colors">
                    <h3 className="font-semibold text-foreground text-sm line-clamp-1">
                      {item.product.name}
                    </h3>
                  </Link>
                  {item.variant && item.variant.options.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {item.variant.options.map((o) => `${o.name}: ${o.value}`).join(", ")}
                    </p>
                  )}
                  <p className="text-sm font-bold text-foreground mt-1">
                    {formatPrice(item.price)} × {item.quantity}
                  </p>
                </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={updateItem.isPending}
                  onClick={() => updateItem.mutate({ productId: item.productId, delta: -1, variantId: item.variant?.id })}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={updateItem.isPending}
                  onClick={() => updateItem.mutate({ productId: item.productId, delta: 1, variantId: item.variant?.id })}
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  disabled={removeItem.isPending}
                  onClick={() => removeItem.mutate({ productId: item.productId, variantId: item.variant?.id })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        onClick={() => clearCart.mutate()}
        disabled={clearCart.isPending}
        className="rounded-xl text-xs text-muted-foreground hover:text-destructive"
      >
        Clear Cart
      </Button>
    </div>
  );
}
