"use client";

import { orderService } from "@/api";
import { paymentService } from "@/api/payment";
import type { OrderResponseDto } from "@/api/dto/order";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { Button } from "@/component/ui/button";
import { formatPrice } from "@/lib/util";
import { CheckCircle2 } from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useSearchParams } from "next/navigation";
import { Suspense,useEffect,useState } from "react";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const callbackReference =
    searchParams.get("reference")?.trim() ||
    searchParams.get("trxref")?.trim() ||
    null;
  const [verifiedOrderId, setVerifiedOrderId] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<
    "idle" | "verifying" | "success" | "pending" | "failed"
  >(callbackReference ? "verifying" : "idle");
  const orderId = searchParams.get("orderId") || verifiedOrderId;
  const [order, setOrder] = useState<OrderResponseDto | null>(null);

  useEffect(() => {
    if (!callbackReference) return;
    let active = true;
    paymentService
      .verify(callbackReference)
      .then(({ data }) => {
        if (!active) return;
        if (data.status === "SUCCESS") {
          setVerifiedOrderId(data.orderId);
          setPaymentState("success");
        } else {
          setPaymentState("pending");
        }
      })
      .catch(() => {
        if (active) setPaymentState("failed");
      });

    return () => {
      active = false;
    };
  }, [callbackReference]);

  useEffect(() => {
    if (!orderId) return;
    orderService
      .getById(orderId)
      .then(({ data }) => setOrder(data))
      .catch(() => setOrder(null));
  }, [orderId]);

  const trackOrderHref = orderId ? `/order/${orderId}` : "/order";

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
          paymentState === "failed"
            ? "bg-destructive/10 text-destructive"
            : "bg-emerald-500/10 text-emerald-500"
        }`}
      >
        <CheckCircle2 className="h-10 w-10" />
      </div>

      <h1 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        {paymentState === "verifying"
          ? "Verifying your payment…"
          : paymentState === "pending"
            ? "Payment is processing"
            : paymentState === "failed"
              ? "Payment confirmation unavailable"
              : "Order Placed Successfully!"}
      </h1>

      {paymentState === "pending" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Your payment has not been confirmed yet. Check your orders again in a
          moment.
        </p>
      )}
      {paymentState === "failed" && (
        <p className="mt-2 text-sm text-muted-foreground">
          We could not verify the payment. Your order status will update when
          Paystack confirms it; please check your orders before trying again.
        </p>
      )}

      {order ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-left shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Reference</span>
            <span className="font-mono text-sm font-bold text-foreground">#{order.orderNumber}</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total Paid</span>
            <span className="text-base font-bold text-foreground">{formatPrice(order.finalAmount || order.totalAmount)}</span>
          </div>
          {order.items && order.items.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {order.items.length} item{order.items.length === 1 ? "" : "s"} purchased
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you for your purchase. Your order is confirmed and being prepared.
        </p>
      )}

      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button asChild className="w-full sm:w-auto rounded-xl px-6 py-2.5 font-semibold shadow-xs">
          <Link href={trackOrderHref}>
            Track This Order
          </Link>
        </Button>
        <Button variant="outline" asChild className="w-full sm:w-auto rounded-xl px-6 py-2.5 font-semibold">
          <Link href="/product" className="inline-flex items-center gap-2">
            Continue Shopping
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <CustomerLayout>
      <Suspense
        fallback={
          <div className="mx-auto max-w-2xl px-4 py-20 text-center">
            <div className="h-10 w-48 mx-auto animate-pulse rounded bg-muted/60" />
          </div>
        }
      >
        <OrderSuccessContent />
      </Suspense>
    </CustomerLayout>
  );
}
