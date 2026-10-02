import { api } from "@/api/core/client";
import type {
InitializePaymentResponseDto,
PaymentResponseDto,
} from "@/api/dto/payment";

export const paymentService = {
  requestOtp(orderId: string) {
    return api.post<{ message?: string }>(
      "/payment/otp/request",
      null,
      { params: { orderId } }
    );
  },
  initialize(orderId: string, otpCode?: string) {
    return api.post<InitializePaymentResponseDto>(
      "/payment/initialize",
      otpCode ? { otpCode } : {},
      {
        params: { orderId },
        headers: otpCode ? { "x-otp-code": otpCode } : undefined,
      }
    );
  },
  getByOrderId(orderId: string) {
    return api.get<PaymentResponseDto>(`/payment/order/${orderId}`);
  },
  verify(reference: string) {
    return api.get<PaymentResponseDto>(
      `/payments/callback?reference=${encodeURIComponent(reference)}`
    );
  },
};