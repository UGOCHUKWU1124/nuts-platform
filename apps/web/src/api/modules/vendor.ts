import { api } from "@/api/core/client";
import type { PublicProductResponseDto } from "@/api/dto/product";
import type {
AdminVendorResponseDto,
VendorProfileDto,
VendorResponseDto,
VendorStoreDto,
VendorWalletResponseDto,
} from "@/api/dto/vendor";
import type { WalletTransactionResponseDto } from "@/api/dto/vendor";
import type { ProductQueryParams } from "./product";

export const publicVendorService = {
  list(params?: ProductQueryParams, signal?: AbortSignal) {
    return api.get<VendorResponseDto[]>("/vendors/store", { params, signal });
  },
  getStore(slug: string) {
    return api.get<VendorStoreDto>(`/vendors/store/${slug}`);
  },
  getProducts(slug: string, params?: ProductQueryParams) {
    return api.get<{ store: VendorStoreDto; products: PublicProductResponseDto[] }>(`/vendors/store/${slug}/products`, {
      params,
    });
  },
};

export const vendorAccountService = {
  me() {
    return api.get<VendorResponseDto>("/vendors/me");
  },
  getAccount() {
    return api.get<VendorResponseDto>("/vendors/account");
  },
  update(payload: Partial<VendorProfileDto>) {
    return api.patch<VendorResponseDto>("/vendors/account", payload);
  },
  deactivate() {
    return api.patch<{ success: boolean }>("/vendors/account/deactivate");
  },
  reactivate() {
    return api.post<{ success: boolean }>("/vendors/account/reactivate");
  },
  deleteAccount() {
    return api.delete<{ success: boolean }>("/vendors/account");
  },
};

export const adminVendorService = {
  list(params: ProductQueryParams) {
    return api.get<AdminVendorResponseDto[]>("/admin/vendors", { params });
  },
  approve(id: string) {
    return api.patch<AdminVendorResponseDto>(`/admin/vendors/${id}/approve`);
  },
  verify(id: string) {
    return api.patch<AdminVendorResponseDto>(`/admin/vendors/${id}/verify`);
  },
  setActive(id: string, active: boolean) {
    return api.patch<AdminVendorResponseDto>(
      `/admin/vendors/${id}/${active ? "reactivate" : "deactivate"}`
    );
  },
  delete(id: string) {
    return api.delete<void>(`/admin/vendors/${id}`);
  },
};

export const vendorWalletService = {
  get() {
    return api.get<VendorWalletResponseDto>("/vendors/wallet");
  },
  getWallet() {
    return api.get<VendorWalletResponseDto>("/vendors/wallet");
  },
  getTransactions(params?: { page?: number; limit?: number }) {
    return api.get<{
      data: WalletTransactionResponseDto[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    }>("/vendors/wallet/transactions", { params });
  },
};
