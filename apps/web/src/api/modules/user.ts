import { api } from "@/api/core/client";
import type {
AdminUserResponseDto,
UserResponseDto,
UserWalletResponseDto,
} from "@/api/dto/user";
import type { WalletTransactionResponseDto } from "@/api/dto/vendor";
import type { ProductQueryParams } from "./product";

export interface UpdateUserProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  phoneNumber?: string;
  email?: string;
}

export interface ShippingPayload {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  country: string;
  isDefault?: boolean;
}

export const userService = {
  me() {
    return api.get<UserResponseDto>("/account");
  },
  updateProfile(payload: UpdateUserProfilePayload) {
    const { phoneNumber, phone, ...rest } = payload;
    const effectivePhone = phone ?? phoneNumber;
    return api.patch<UserResponseDto>("/account", {
      ...rest,
      ...(effectivePhone !== undefined ? { phone: effectivePhone } : {}),
    });
  },
  updateShipping(payload: ShippingPayload) {
    return api.patch<UserResponseDto>("/account", {
      shippingInformation: payload,
    });
  },
  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return api.patch<null>("/account/password", payload);
  },
  requestDeactivateOtp() {
    return api.post<{ message: string }>("/account/otp/request");
  },
  deactivate(otpCode: string) {
    return api.patch<{ message: string }>("/account/deactivate", {}, {
      headers: { "x-otp-code": otpCode },
    });
  },
  reactivate(payload: { email: string; password: string }) {
    return api.post<UserResponseDto>("/account/reactivate", payload);
  },
  deleteAccount() {
    return api.delete<null>("/account/delete");
  },
};

export const adminUserService = {
  list(params: ProductQueryParams & { search?: string; status?: string }) {
    return api.get<AdminUserResponseDto[]>("/admin/users", { params });
  },
  reactivate(id: string, otpCode: string) {
    return api.patch<{ success: boolean }>(`/admin/users/${id}/reactivate`, {}, {
      headers: { "x-otp-code": otpCode },
    });
  },
  deactivate(id: string, payload: { reason: string }, otpCode: string) {
    return api.patch<{ success: boolean }>(`/admin/users/${id}/deactivate`, payload, {
      headers: { "x-otp-code": otpCode },
    });
  },
  delete(id: string) {
    return api.delete<void>(`/admin/users/${id}`);
  },
};

export const walletService = {
  getUserWallet() {
    return api.get<UserWalletResponseDto>("/users/wallet");
  },
  getUserTransactions(params?: { page?: number; limit?: number }) {
    return api.get<{
      data: WalletTransactionResponseDto[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    }>("/users/wallet/transactions", { params });
  },
};
