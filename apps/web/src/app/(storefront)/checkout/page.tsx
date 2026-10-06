"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import { cartService,orderService,paymentService,userService } from "@/api";
import { getApiErrorMessage } from "@/api/core/error";
import type { CheckoutPayload } from "@/api/order";
import { FormInput } from "@/component/form/FormInput";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { Button } from "@/component/ui/button";
import { Input } from "@/component/ui/input";
import { queryKey } from "@/lib/query-key";
import { safePaystackCheckoutUrl } from "@/lib/safe-paystack-url";
import { formatPrice } from "@/lib/util";
import { useAuthStore } from "@/zustand/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation,useQuery } from "@tanstack/react-query";
import {
ArrowLeft,
CheckCircle2,
CreditCard,
Loader2,
ShoppingBag,
Tag,
Truck
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect,useState } from "react";
import { FormProvider,useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addressSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  phone: z.string().min(8, "Valid phone number is required"),
  street: z.string().min(4, "Street address is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  country: z.string().optional().default("Nigeria"),
});

type AddressForm = z.infer<typeof addressSchema>;

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [promoCode, setPromoCode] = useState(() => searchParams.get("code") ?? "");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [addressMode, setAddressMode] = useState<"default" | "new">("default");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const authUser = useAuthStore((state) => state.user);

  // Fetch fresh user profile to read default shipping address
  const { data: userProfile } = useQuery({
    queryKey: ["user", "profile"],
    queryFn: async () => (await userService.me()).data,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
  });

  const defaultAddress = userProfile?.shippingInformation ?? authUser?.shippingInformation;
  const hasDefaultAddress = Boolean(defaultAddress?.street && defaultAddress?.city);

  // If user doesn't have a default address, stay in "new" address mode
  const effectiveAddressMode = hasDefaultAddress ? addressMode : "new";

  const {
    data: cartData,
    isLoading: cartLoading,
    isError: cartError,
    refetch: refetchCart,
  } = useQuery({
    queryKey: queryKey.cart,
    queryFn: async () => (await cartService.get()).data,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 20,
  });

  const form = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    defaultValues: { country: "Nigeria" },
  });

  // Pre-fill form if user wants to edit or start from default
  useEffect(() => {
    if (defaultAddress && !form.getValues("street")) {
      form.reset({
        fullName: defaultAddress.fullName || "",
        phone: defaultAddress.phone || "",
        street: defaultAddress.street || "",
        city: defaultAddress.city || "",
        state: defaultAddress.state || "",
        country: defaultAddress.country || "Nigeria",
      });
    }
  }, [defaultAddress, form]);

  // Revalidate a saved promotion against the server before applying it.
  useEffect(() => {
    let initialCode = searchParams.get("code") ?? "";
    if (!initialCode) {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem("nuts_applied_discount") ?? "null");
        if (saved && typeof saved === "object" && "code" in saved && typeof saved.code === "string") {
          initialCode = saved.code;
        }
      } catch {}
    }

    if (!initialCode) return;
    void cartService
      .previewDiscount(initialCode)
      .then((res) => {
          setPromoCode(res.data.code);
          const discountData = {
            code: res.data.code,
            amount: res.data.discountAmount,
          };
          setAppliedDiscount(discountData);
          try {
            localStorage.setItem("nuts_applied_discount", JSON.stringify(discountData));
          } catch {}
          toast.success(`Discount code "${res.data.code}" applied!`);
        })
      .catch(() => {
          try {
            localStorage.removeItem("nuts_applied_discount");
          } catch {}
        })
      .finally(() => setIsApplyingPromo(false));
  }, [searchParams]);

  const checkoutMutation = useMutation({
    mutationFn: (payload: CheckoutPayload) => orderService.checkout(payload),
    onSuccess: async (res) => {
      const order = res.data;
      const orderId = order.id;
      const directUrl = order.authorizationUrl;

      // Clean up applied discount from localStorage on successful order
      try {
        localStorage.removeItem("nuts_applied_discount");
      } catch {}

      if (directUrl) {
        const checkoutUrl = safePaystackCheckoutUrl(directUrl);
        if (!checkoutUrl) {
          toast.error("The payment provider returned an invalid checkout link.");
          router.push(`/order/${encodeURIComponent(orderId)}`);
          return;
        }
        window.location.assign(checkoutUrl);
        return;
      }

      try {
        const { data: payment } = await paymentService.getByOrderId(orderId);
        if (payment.paymentLink) {
          const checkoutUrl = safePaystackCheckoutUrl(payment.paymentLink);
          if (!checkoutUrl) {
            toast.error("The payment provider returned an invalid checkout link.");
            router.push(`/order/${encodeURIComponent(orderId)}`);
            return;
          }
          window.location.assign(checkoutUrl);
          return;
        }
      } catch (error: unknown) {
        toast.error(
          `Your order was created, but payment could not be opened. Continue from your order details. ${getApiErrorMessage(error, "")}`.trim()
        );
      }

      router.push(`/order/${encodeURIComponent(orderId)}`);
    },
    onError: (err: unknown) =>
      toast.error(getApiErrorMessage(err, "Checkout failed. Please review your address.")),
  });

  const handleCheckoutSubmit = (v?: AddressForm) => {
    let shipping: AddressForm;
    if (effectiveAddressMode === "default" && defaultAddress) {
      shipping = {
        fullName: defaultAddress.fullName,
        phone: defaultAddress.phone,
        street: defaultAddress.street,
        city: defaultAddress.city,
        state: defaultAddress.state,
        country: defaultAddress.country || "Nigeria",
      };
    } else if (v) {
      shipping = v;
      if (saveAsDefault) {
        userService
          .updateShipping({
            fullName: v.fullName,
            phone: v.phone,
            street: v.street,
            city: v.city,
            state: v.state,
            country: v.country || "Nigeria",
            isDefault: true,
          })
          .catch((error: unknown) => {
            toast.error(getApiErrorMessage(error, "Your address could not be saved as default"));
          });
      }
    } else {
      return;
    }

    checkoutMutation.mutate({
      shippingAddress: shipping,
      ...(appliedDiscount ? { discountCode: appliedDiscount.code } : {}),
    });
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim() || checkoutMutation.isPending) return;
    setIsApplyingPromo(true);
    try {
      const res = await cartService.previewDiscount(promoCode.trim());
      const discountData = {
        code: res.data.code,
        amount: res.data.discountAmount,
      };
      setAppliedDiscount(discountData);
      try {
        localStorage.setItem("nuts_applied_discount", JSON.stringify(discountData));
      } catch {}
      toast.success(`Discount code "${res.data.code}" applied!`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Invalid or expired promo code"));
      setAppliedDiscount(null);
      try {
        localStorage.removeItem("nuts_applied_discount");
      } catch {}
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    if (checkoutMutation.isPending) return;
    setAppliedDiscount(null);
    setPromoCode("");
    try {
      localStorage.removeItem("nuts_applied_discount");
    } catch {}
    toast.info("Discount code removed");
  };

  if (cartLoading) {
    return (
      <CustomerLayout>
        <div className="mx-auto max-w-7xl px-4 py-24 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
          <p className="mt-4 text-sm text-neutral-500">Preparing checkout...</p>
        </div>
      </CustomerLayout>
    );
  }

  if (cartError) {
    return (
      <CustomerLayout>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            We couldn&apos;t load your cart
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your cart has not been cleared. Try loading it again before continuing to checkout.
          </p>
          <Button
            type="button"
            onClick={() => void refetchCart()}
            className="mt-5"
          >
            Try again
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  const items = cartData?.cartItems ?? [];
  const subtotal = cartData?.cart.subtotal ?? 0;
  const deliveryCharge = cartData?.cart.deliveryCharge ?? 0;
  const serviceCharge = cartData?.cart.serviceCharge ?? 0;
  const discountAmount = appliedDiscount?.amount ?? (cartData?.cart.discountAmount ?? 0);
  const totalAmount = Math.max(0, subtotal + deliveryCharge + serviceCharge - discountAmount);

  if (items.length === 0) {
    return (
      <CustomerLayout>
        <div className="mx-auto max-w-md py-24 text-center px-4">
          <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground stroke-[1.2]" />
          <h1 className="mt-4 text-2xl font-semibold text-foreground">Your cart is empty</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please add items to your cart before proceeding to checkout.
          </p>
          <Button asChild className="mt-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 px-6 text-sm font-medium">
            <Link href="/product">Browse Catalog</Link>
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="mx-auto max-w-7xl px-3 pb-28 pt-5 sm:px-6 sm:py-8 lg:px-8 lg:pb-8">
        {/* Navigation & Header */}
        <div className="mb-6 flex items-center justify-between border-b border-border pb-4 sm:mb-8 sm:pb-5">
          <div>
            <Link
              href="/cart"
              className="inline-flex items-center gap-2 text-sm sm:text-base font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
              <span>Back to shopping cart</span>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
              Checkout
            </h1>
          </div>
        </div>

        {/* Two-Column Checkout Layout */}
        <div className="grid items-start gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
          {/* Left Column: Checkout Forms */}
          <div className="space-y-5 sm:space-y-8">
            <FormProvider {...form}>
              <form
                id="checkout-form"
                onSubmit={
                  effectiveAddressMode === "default"
                    ? (e) => {
                        e.preventDefault();
                        handleCheckoutSubmit();
                      }
                    : form.handleSubmit((v) => handleCheckoutSubmit(v))
                }
                className="space-y-5 sm:space-y-8"
              >
                {/* Step 1: Delivery Address */}
                <div className="rounded-2xl border border-border bg-card p-4 shadow-xs sm:rounded-3xl sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    <h2 className="text-lg font-semibold text-foreground">
                      Shipping &amp; Delivery Address
                    </h2>
                  </div>

                  {/* Address Choice: Default vs New Address */}
                  {hasDefaultAddress && defaultAddress && (
                    <div className="mb-6 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setAddressMode("default")}
                          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                            effectiveAddressMode === "default"
                              ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary"
                              : "border-border hover:border-primary/50 bg-card"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                              Use Default Address
                            </span>
                            {effectiveAddressMode === "default" && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                ✓
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
                            {defaultAddress.street}, {defaultAddress.city}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAddressMode("new")}
                          className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                            effectiveAddressMode === "new"
                              ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary"
                              : "border-border hover:border-primary/50 bg-card"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                              New Address
                            </span>
                            {effectiveAddressMode === "new" && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                ✓
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Deliver to different location
                          </p>
                        </button>
                      </div>

                      {/* Display summary of default address when selected */}
                      {effectiveAddressMode === "default" && (
                        <div className="space-y-1 rounded-2xl border border-border bg-secondary/40 p-4 text-sm">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-foreground">{defaultAddress.fullName}</p>
                            <span className="text-muted-foreground">{defaultAddress.phone}</span>
                          </div>
                          <p className="text-muted-foreground">
                            {defaultAddress.street}, {defaultAddress.city}, {defaultAddress.state},{" "}
                            {defaultAddress.country || "Nigeria"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual New Address Inputs (shown when in "new" mode or when no default exists) */}
                  {effectiveAddressMode === "new" && (
                    <div className="space-y-4">
                      {hasDefaultAddress && (
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Please enter the delivery information for this order:
                        </p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <FormInput
                            name="fullName"
                            label="Full Name"
                            placeholder="John Doe"
                          />
                        </div>

                        <FormInput
                          name="phone"
                          label="Phone Number"
                          placeholder="08012345678"
                        />

                        <FormInput
                          name="city"
                          label="City"
                          placeholder="Lagos"
                        />

                        <div className="sm:col-span-2">
                          <FormInput
                            name="street"
                            label="Street Address"
                            placeholder="123 Admiralty Way, Lekki Phase 1"
                          />
                        </div>

                        <FormInput
                          name="state"
                          label="State"
                          placeholder="Lagos State"
                        />

                        <FormInput
                          name="country"
                          label="Country"
                          placeholder="Nigeria"
                        />
                      </div>

                      <div className="pt-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={saveAsDefault}
                            onChange={(e) => setSaveAsDefault(e.target.checked)}
                            className="h-4 w-4 rounded accent-primary"
                          />
                          <span>Save as my default shipping address</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 2: Delivery Method */}
                <div className="rounded-2xl border border-border bg-card p-4 shadow-xs sm:rounded-3xl sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      2
                    </span>
                    <h2 className="text-lg font-semibold text-foreground">
                      Delivery Method
                    </h2>
                  </div>

                  <div className="flex items-start justify-between gap-3 rounded-2xl border-2 border-primary bg-primary/5 p-3 sm:items-center sm:p-4">
                    <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-3.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:h-10 sm:w-10">
                        <Truck className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          Standard Express Dispatch
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Estimated 24 – 48 business hours
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 pt-1 text-xs font-semibold text-foreground sm:pt-0">
                      {deliveryCharge > 0 ? formatPrice(deliveryCharge) : "Free"}
                    </span>
                  </div>
                </div>

                {/* Step 3: Payment Method */}
                <div className="rounded-2xl border border-border bg-card p-4 shadow-xs sm:rounded-3xl sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      3
                    </span>
                    <h2 className="text-lg font-semibold text-foreground">
                      Payment Gateway
                    </h2>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-start gap-3 sm:items-center">
                        <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-foreground sm:mt-0" />
                        <div>
                          <p className="text-sm font-bold text-foreground">
                            Paystack Secure Checkout
                          </p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Securely pay by card, bank transfer, or USSD on Paystack.
                          </p>
                        </div>
                      </div>
                      <CheckCircle2 className="h-5 w-5 fill-black text-white" />
                    </div>
                  </div>
                </div>
              </form>
            </FormProvider>
          </div>

          {/* Right Column: Sticky Order Summary */}
          <aside className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-xs sm:space-y-6 sm:rounded-3xl sm:p-7 lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-foreground">
              Order Review ({items.length})
            </h2>

            {/* Itemized List */}
            <div className="max-h-56 divide-y divide-border/70 overflow-y-auto pr-1 [scrollbar-width:thin] sm:max-h-72">
              {items.map((item) => {
                const img =
                  item.product.images && item.product.images.length > 0
                    ? item.product.images[0]?.url
                    : null;

                return (
                  <div key={item.id} className="flex items-center gap-3.5 py-3.5 first:pt-0">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary">
                      {img ? (
                        <RemoteImage
                          src={img}
                          alt={item.product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ShoppingBag className="h-6 w-6 stroke-[1.2]" />
                        </div>
                      )}
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground px-1 text-xs font-semibold">
                        {item.quantity}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity} × {formatPrice(item.price)}
                      </p>
                    </div>

                    <span className="text-sm font-semibold text-foreground shrink-0">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Promo Code Input / Applied State */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Discount Code
              </label>
              {appliedDiscount ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground uppercase">{appliedDiscount.code}</span>
                      <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">(-{formatPrice(discountAmount)})</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePromo}
                    disabled={checkoutMutation.isPending}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors font-semibold disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    disabled={checkoutMutation.isPending || isApplyingPromo}
                    className="h-10 rounded-xl bg-background text-sm uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyPromo}
                    disabled={checkoutMutation.isPending || isApplyingPromo || !promoCode.trim()}
                    className="h-10 rounded-xl px-3 text-sm font-medium"
                  >
                    {isApplyingPromo ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Pricing Breakdown */}
            <div className="space-y-3 border-t border-border pt-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-semibold text-foreground">
                  {formatPrice(subtotal)}
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground">
                <span>Delivery</span>
                <span className="font-semibold text-foreground">
                  {deliveryCharge > 0 ? formatPrice(deliveryCharge) : "₦0.00"}
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground">
                <span>Service Fee</span>
                <span className="font-semibold text-foreground">
                  {serviceCharge > 0 ? formatPrice(serviceCharge) : "₦0.00"}
                </span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Discount</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              )}

              <div className="border-t border-border pt-3 flex justify-between text-base sm:text-lg font-bold text-foreground">
                <span>Total Due</span>
                <span>{formatPrice(totalAmount)}</span>
              </div>
            </div>

            {/* Pay Button */}
            <Button
              type="submit"
              form="checkout-form"
              disabled={checkoutMutation.isPending || isApplyingPromo}
              className="hidden w-full rounded-full bg-primary py-6 text-base font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 lg:flex lg:items-center lg:justify-center lg:gap-2"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing Payment...</span>
                </>
              ) : (
                <span>Pay {formatPrice(totalAmount)}</span>
              )}
            </Button>
          </aside>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pt-3 shadow-[0_-4px_18px_rgba(0,0,0,0.08)] backdrop-blur-lg pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Total due
            </p>
            <p className="truncate text-lg font-bold text-foreground">
              {formatPrice(totalAmount)}
            </p>
          </div>
          <Button
            type="submit"
            form="checkout-form"
            disabled={checkoutMutation.isPending || isApplyingPromo}
            className="min-h-12 min-w-40 rounded-xl px-5 font-semibold"
          >
            {checkoutMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                Pay securely
                <CreditCard className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </CustomerLayout>
  );
}
