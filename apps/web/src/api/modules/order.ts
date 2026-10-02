import { api } from "@/api/core/client";
import type {
AdminOrderResponseDto,
CheckoutResponseDto,
OrderResponseDto,
OrderSummaryDto,
VendorOrderResponseDto,
} from "@/api/dto/order";

export interface CheckoutPayload {
  shippingAddress?: {
    fullName: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    country?: string;
  };
  discountCode?: string;
  addressId?: string;
}

export const orderService = {
  checkout(payload: CheckoutPayload, idempotencyKey?: string) {
    const key = idempotencyKey || (typeof crypto !== "undefined" ? crypto.randomUUID() : `order-${Date.now()}`);
    return api.post<CheckoutResponseDto>("/orders/checkout", payload, {
      headers: { "idempotency-key": key },
    });
  },
  list(params?: { page?: number; limit?: number; status?: string }) {
    return api.get<OrderSummaryDto[]>("/orders", { params });
  },
  getById(id: string) {
    return api.get<OrderResponseDto>(`/orders/${id}`);
  },
  cancel(id: string) {
    return api.post<OrderResponseDto>(`/orders/${id}/cancel`);
  },
  updateShipping(id: string, shippingAddress: string) {
    return api.patch<OrderResponseDto>(`/orders/${id}/shipping`, { shippingAddress });
  },
};

export const adminOrderService = {
  list(params?: { page?: number; limit?: number; search?: string; status?: string }) {
    return api.get<AdminOrderResponseDto[]>("/admin/orders", { params });
  },
  getById(id: string) {
    return api.get<AdminOrderResponseDto>(`/admin/orders/${id}`);
  },
  updateStatus(id: string, payload: { status: string; note?: string }) {
    return api.patch<AdminOrderResponseDto>(`/admin/orders/${id}/status`, payload);
  },
};

export const dashboardOrderService = {
  list(params?: { page?: number; limit?: number; search?: string; status?: string }) {
    return api.get<VendorOrderResponseDto[]>("/vendors/orders", { params });
  },
  getById(id: string) {
    return api.get<VendorOrderResponseDto>(`/vendors/orders/${id}`);
  },
  updateStatus(id: string, payload: { status: string; note?: string }) {
    return api.patch<VendorOrderResponseDto>(`/vendors/orders/${id}/status`, payload);
  },
};