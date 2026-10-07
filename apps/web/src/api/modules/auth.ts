import { api } from "@/api/core/client";
import type {
AdminLoginPayload,
AdminSetupPayload,
AuthUserDto,
AuthResponseDto,
LoginPayload,
OtpRequestPayload,
RegisterPayload,
RegisterResponseDto,
ResetPasswordPayload,
VendorLoginPayload,
VendorOtpRequestPayload,
VendorRegisterPayload,
VerifyOtpResponseDto,
} from "@/api/dto/auth";

export const authService = {
  requestOtp(payload: OtpRequestPayload) {
    return api.post<VerifyOtpResponseDto>("/auth/otp/request", payload);
  },
  requestRegistrationOtp(payload: OtpRequestPayload) {
    return api.post<VerifyOtpResponseDto>("/auth/otp/request", payload);
  },
  requestPasswordResetOtp(payload: { email: string }) {
    return api.post<{ message: string }>("/auth/forgot-password", payload);
  },
  register(payload: RegisterPayload) {
    return api.post<RegisterResponseDto>("/auth/register", payload);
  },
  resetPassword(payload: ResetPasswordPayload) {
    const { otp, otpCode, ...rest } = payload;
    return api.post<{ message: string }>("/auth/reset-password", {
      ...rest,
      otpCode: otpCode ?? otp,
    });
  },
  login(payload: LoginPayload) {
    return api.post<AuthResponseDto>("/auth/login", payload);
  },
  me() {
    return api.get<{ id: string; email: string; firstName?: string; lastName?: string }>("/auth/me");
  },
  refresh() {
    return api.post<AuthResponseDto>("/auth/refresh");
  },
  logout() {
    return api.post<void>("/auth/logout");
  },
};

export const adminAuthService = {
  setup(payload: AdminSetupPayload) {
    return api.post<AuthResponseDto>("/admin/auth/setup", payload);
  },
  login(payload: AdminLoginPayload) {
    return api.post<AuthResponseDto>("/admin/auth/login", payload);
  },
  me() {
    return api.get<AuthUserDto>("/admin/auth/me");
  },
  updateMe(payload: { firstName?: string; lastName?: string }) {
    return api.patch<AuthResponseDto>("/admin/auth/me", payload);
  },
  refresh() {
    return api.post<AuthResponseDto>("/admin/auth/refresh");
  },
  logout() {
    return api.post<void>("/admin/auth/logout");
  },
};

export const vendorAuthService = {
  requestOtp(payload: VendorOtpRequestPayload) {
    return api.post<VerifyOtpResponseDto>("/vendors/auth/otp/request", payload);
  },
  register(payload: VendorRegisterPayload) {
    return api.post<RegisterResponseDto>("/vendors/auth/register", payload);
  },
  login(payload: VendorLoginPayload) {
    return api.post<import("@/api/dto/vendor").VendorAuthSessionDto>(
      "/vendors/auth/login",
      payload
    );
  },
  logout() {
    return api.post<void>("/vendors/auth/logout");
  },
};
