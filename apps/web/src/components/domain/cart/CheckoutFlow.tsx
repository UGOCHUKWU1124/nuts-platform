"use client";

import { getApiErrorMessage } from "@/api/core/error";
import type { InitializePaymentResponseDto } from "@/api/dto/payment";
import type { UserResponseDto } from "@/api/dto/user";
import { orderService,type CheckoutPayload } from "@/api/order";
import { paymentService } from "@/api/payment";
import { Button } from "@/component/ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogFooter,
DialogHeader,
DialogTitle,
} from "@/component/ui/dialog";
import { Input } from "@/component/ui/input";
import { Label } from "@/component/ui/label";
import { safePaystackCheckoutUrl } from "@/lib/safe-paystack-url";
import { CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface CheckoutFlowProps {
  onOrderCreated?: (orderId: string) => void;
  user: UserResponseDto | null;
}

export function CheckoutFlow({ onOrderCreated, user }: CheckoutFlowProps) {
  const router = useRouter();
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!user?.shippingInformation) {
      toast.error("No shipping information on file");
      return;
    }
    setLoading(true);
    try {
      const { fullName, phone, street, city, state, country } =
        user.shippingInformation;
      const { data: order } = await orderService.checkout({
        shippingAddress: { fullName, phone, street, city, state, country },
      } as CheckoutPayload);
      const orderId = order.id;
      setPendingOrderId(orderId);
      onOrderCreated?.(orderId);

      // Request payment OTP
      try {
        void await paymentService.requestOtp(orderId);
        toast("A payment OTP has been sent to your email.");
      } catch {
        // OTP maybe already verified or not required — just show OTP dialog
      }
      setOtpOpen(true);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Checkout failed"));
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!pendingOrderId || !otp) return;
    try {
      const { data: res }: { data: InitializePaymentResponseDto } = await paymentService.initialize(
pendingOrderId, otp);
      if (res.authorizationUrl) {
        const checkoutUrl = safePaystackCheckoutUrl(res.authorizationUrl);
        if (!checkoutUrl) throw new Error("Invalid Paystack checkout URL");
        window.location.assign(checkoutUrl);
      } else {
        toast.success("Payment initialized");
        router.push("/order");
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Payment failed"));
    }
  };

  return (
    <>
      <Button className="w-full" onClick={handleCheckout} disabled={loading || !user}>
        {loading ? "Processing..." : "Proceed to Pay"}
      </Button>

      <Dialog open={otpOpen} onOpenChange={setOtpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete Payment</DialogTitle>
            <DialogDescription>
              Enter the OTP sent to your email to complete payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="otp">OTP Code</Label>
            <Input id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOtpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePay} disabled={!otp}>
              <CreditCard className="h-4 w-4" />
              Pay Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
