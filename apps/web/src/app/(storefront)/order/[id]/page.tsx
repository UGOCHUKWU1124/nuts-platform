"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import { orderService,paymentService } from "@/api";
import { getApiErrorMessage } from "@/api/core/error";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { ConfirmDialog } from "@/component/modal/ConfirmDialog";
import { OtpPromptDialog } from "@/component/modal/OtpPromptDialog";
import { OrderStatusBadge } from "@/component/order/OrderItemSnapshot";
import { WriteReviewDialog } from "@/component/review/WriteReviewDialog";
import { Button } from "@/component/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/component/ui/card";
import { queryKey } from "@/lib/query-key";
import { safePaystackCheckoutUrl } from "@/lib/safe-paystack-url";
import { formatDate,formatPrice } from "@/lib/util";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import {
ArrowLeft,
CreditCard,
Edit2,
MapPin,
Package,
Receipt,
Star
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();

  // Dialog States
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isEditShippingOpen, setIsEditShippingOpen] = useState(false);
  const [shippingAddressText, setShippingAddressText] = useState("");
  const [isPaymentOtpOpen, setIsPaymentOtpOpen] = useState(false);
  const [isRequestingPaymentOtp, setIsRequestingPaymentOtp] = useState(false);

  // 1. Fetch Order
  const { data: order, isLoading } = useQuery({
    queryKey: queryKey.order.detail(id),
    queryFn: async () => {
      const { data } = await orderService.getById(id);
      return data;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
  });

  // Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: () => orderService.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey.order.list() });
      qc.invalidateQueries({ queryKey: queryKey.order.detail(id) });
      setIsCancelOpen(false);
      toast.success("Order cancelled successfully");
    },
    onError: (err: unknown) =>
      toast.error(getApiErrorMessage(err, "Failed to cancel order")),
  });

  // Update Shipping Mutation
  const updateShippingMutation = useMutation({
    mutationFn: (newAddress: string) => orderService.updateShipping(id, newAddress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey.order.detail(id) });
      setIsEditShippingOpen(false);
      toast.success("Shipping address updated successfully");
    },
    onError: (err: unknown) =>
      toast.error(getApiErrorMessage(err, "Failed to update shipping address")),
  });

  // Payment Initialization Flow
  const handleInitiatePayment = async () => {
    try {
      setIsRequestingPaymentOtp(true);
      await paymentService.requestOtp(id);
      toast.success("A payment authorization code has been sent to your email.");
      setIsPaymentOtpOpen(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to request payment authorization code."));
    } finally {
      setIsRequestingPaymentOtp(false);
    }
  };

  const paymentMutation = useMutation({
    mutationFn: (otpCode: string) => paymentService.initialize(id, otpCode),
    onSuccess: (res) => {
      setIsPaymentOtpOpen(false);
      const authUrl = res.data?.authorizationUrl;
      if (authUrl) {
        const checkoutUrl = safePaystackCheckoutUrl(authUrl);
        if (!checkoutUrl) throw new Error("Invalid Paystack checkout URL");
        toast.success("Redirecting to Paystack to complete payment...");
        window.location.assign(checkoutUrl);
      } else {
        toast.success("Payment initiated successfully");
        qc.invalidateQueries({ queryKey: queryKey.order.detail(id) });
      }
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Payment initialization failed. Check your OTP code."));
    },
  });

  if (isLoading) {
    return (
      <CustomerLayout>
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="h-64 animate-pulse rounded-3xl bg-neutral-100 dark:bg-neutral-900" />
        </div>
      </CustomerLayout>
    );
  }

  if (!order) {
    return (
      <CustomerLayout>
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <p className="text-muted-foreground">Order not found.</p>
          <Button asChild variant="outline" className="mt-4 rounded-full">
            <Link href="/order">Back to Orders</Link>
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  const isPending = order.status === "PENDING";
  const isDelivered = order.status === "DELIVERED";
  const isCancelled = order.status === "CANCELLED";

  // Format shipping address display
  const renderShippingAddress = () => {
    if (!order.shippingAddress) {
      return <p className="text-muted-foreground">No shipping address recorded.</p>;
    }
    if (typeof order.shippingAddress === "string") {
      return <p className="text-sm font-medium leading-relaxed">{order.shippingAddress}</p>;
    }
    return (
      <address className="not-italic text-sm font-medium leading-relaxed space-y-1">
        <p className="font-bold text-foreground">{order.shippingAddress.fullName}</p>
        <p>{order.shippingAddress.street}</p>
        <p>
          {order.shippingAddress.city}, {order.shippingAddress.state}, {order.shippingAddress.country}
        </p>
        <p className="text-muted-foreground text-xs">{order.shippingAddress.phone}</p>
      </address>
    );
  };

  const getShippingStringForEdit = (): string => {
    if (typeof order.shippingAddress === "string") return order.shippingAddress;
    if (order.shippingAddress) {
      return `${order.shippingAddress.fullName}, ${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.state}, ${order.shippingAddress.country}. Phone: ${order.shippingAddress.phone}`;
    }
    return "";
  };

  return (
    <CustomerLayout>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        {/* Top Breadcrumb & Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/order"
            className="inline-flex items-center gap-2 text-sm sm:text-base font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
            <span>Back to My Orders</span>
          </Link>

          <div className="flex items-center gap-3">
            {isPending && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCancelOpen(true)}
                  className="rounded-xl text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/40 dark:hover:bg-rose-950/20"
                >
                  Cancel Order
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isRequestingPaymentOtp}
                  onClick={handleInitiatePayment}
                  className="rounded-xl text-xs font-bold bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 shadow-xs flex items-center gap-2"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>{isRequestingPaymentOtp ? "Requesting OTP..." : "Pay with Paystack"}</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Order Header Card */}
        <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-100 dark:border-neutral-800 pb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
                  #{order.orderNumber}
                </h1>
                <OrderStatusBadge status={order.status} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Placed on {formatDate(new Date(order.createdAt).toISOString())}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs text-muted-foreground">Total Final Amount</p>
              <p className="text-2xl font-bold text-foreground">{formatPrice(order.finalAmount)}</p>
            </div>
          </div>

          {/* Simple Lifecycle Progress Bar */}
          <div className="pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Fulfillment Status
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Placed", active: true },
                {
                  label: "Confirmed",
                  active: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status),
                },
                {
                  label: "In Transit",
                  active: ["SHIPPED", "DELIVERED"].includes(order.status),
                },
                {
                  label: "Delivered",
                  active: order.status === "DELIVERED",
                },
              ].map((step, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isCancelled
                        ? "bg-rose-200 dark:bg-rose-950"
                        : step.active
                        ? "bg-neutral-900 dark:bg-white"
                        : "bg-neutral-100 dark:bg-neutral-800"
                    }`}
                  />
                  <p
                    className={`text-xs font-semibold ${
                      step.active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content Split: Items & Summary */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Order Items (2 cols) */}
          <div className="md:col-span-2 space-y-6">
            <Card className="rounded-2xl border-neutral-200/80 dark:border-neutral-800">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4 text-neutral-500" />
                  <span>Ordered Items ({order.items.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-neutral-100 dark:divide-neutral-800/80 p-0">
                {order.items.map((item, idx) => (
                  <div key={idx} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {item.productSnapshot?.images?.[0] ? (
                        <RemoteImage
                          src={item.productSnapshot.images[0]}
                          alt={item.productSnapshot.name}
                          className="h-16 w-16 rounded-xl object-cover border border-neutral-200 dark:border-neutral-800 shrink-0"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-400 shrink-0">
                          <Package className="h-6 w-6" />
                        </div>
                      )}

                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {item.productSnapshot?.name ?? "Product Item"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Qty: <span className="font-semibold text-foreground">{item.quantity}</span> ·{" "}
                          {formatPrice(item.unitPrice)} each
                        </p>
                        {item.variantSnapshot?.options && item.variantSnapshot.options.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.variantSnapshot.options.map((opt, oIdx) => (
                              <span
                                key={oIdx}
                                className="inline-block rounded-md bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-300"
                              >
                                {opt.name}: {opt.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end justify-between gap-2">
                      <span className="font-bold text-foreground text-sm">
                        {formatPrice(item.totalPrice)}
                      </span>

                      {/* Review Button if order is DELIVERED */}
                      {isDelivered && (
                        <WriteReviewDialog
                          productId={item.productId}
                          productName={item.productSnapshot?.name ?? "Product"}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-xs h-8 px-3 font-semibold flex items-center gap-1.5"
                          >
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            <span>Review Item</span>
                          </Button>
                        </WriteReviewDialog>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: Shipping & Payment Summary */}
          <div className="space-y-6">
            {/* Shipping Address Card */}
            <Card className="rounded-2xl border-neutral-200/80 dark:border-neutral-800">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-neutral-500" />
                  <span>Shipping Address</span>
                </CardTitle>
                {isPending && (
                  <button
                    type="button"
                    onClick={() => {
                      setShippingAddressText(getShippingStringForEdit());
                      setIsEditShippingOpen(true);
                    }}
                    className="text-xs font-semibold text-neutral-500 hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                )}
              </CardHeader>
              <CardContent className="text-xs pt-1">
                {renderShippingAddress()}
              </CardContent>
            </Card>

            {/* Price Breakdown */}
            <Card className="rounded-2xl border-neutral-200/80 dark:border-neutral-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-neutral-500" />
                  <span>Payment Breakdown</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-semibold text-foreground">{formatPrice(order.totalAmount)}</span>
                </div>

                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount Code</span>
                    <span>-{formatPrice(order.discountAmount)}</span>
                  </div>
                )}

                {order.referralDiscountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Referral Discount</span>
                    <span>-{formatPrice(order.referralDiscountAmount)}</span>
                  </div>
                )}

                <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 flex justify-between text-sm font-semibold">
                  <span>Total Due</span>
                  <span className="text-foreground">{formatPrice(order.finalAmount)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Dialog 1: Cancel Order */}
        <ConfirmDialog
          open={isCancelOpen}
          onOpenChange={setIsCancelOpen}
          title="Cancel this order?"
          description={`Are you sure you want to cancel order #${order.orderNumber}? Any reserved items will be released back into inventory.`}
          confirmText="Yes, Cancel Order"
          variant="destructive"
          isLoading={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate()}
        />

        {/* Dialog 2: Edit Shipping Address */}
        {isEditShippingOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
              <h3 className="text-base font-semibold text-foreground">Update Shipping Address</h3>
              <p className="text-xs text-muted-foreground">
                You can change the delivery destination before the order begins processing.
              </p>

              <textarea
                value={shippingAddressText}
                onChange={(e) => setShippingAddressText(e.target.value)}
                rows={3}
                placeholder="Full address, city, state, country, and contact phone..."
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={updateShippingMutation.isPending}
                  onClick={() => setIsEditShippingOpen(false)}
                  className="rounded-xl text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!shippingAddressText.trim() || updateShippingMutation.isPending}
                  onClick={() => updateShippingMutation.mutate(shippingAddressText.trim())}
                  className="rounded-xl text-xs h-9 font-bold bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 shadow-xs"
                >
                  {updateShippingMutation.isPending ? "Saving..." : "Save Address"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Dialog 3: Payment OTP Prompt */}
        <OtpPromptDialog
          open={isPaymentOtpOpen}
          onOpenChange={setIsPaymentOtpOpen}
          title="Payment Authorization"
          description={`Enter the 6-digit verification code sent to your email to authorize the payment of ${formatPrice(
            order.finalAmount
          )}.`}
          codeLabel="Payment Verification Code"
          codeSubtitle="Sent to your email"
          confirmText="Proceed to Paystack"
          isLoading={paymentMutation.isPending}
          onSubmit={({ otpCode }) => paymentMutation.mutate(otpCode)}
        />
      </div>
    </CustomerLayout>
  );
}
