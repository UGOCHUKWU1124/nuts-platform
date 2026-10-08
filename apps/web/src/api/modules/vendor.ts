import { adminApi, publicApi, vendorApi } from "@/api/core/client";
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
    return publicApi.get<VendorResponseDto[]>("/vendors/store", { params, signal });
  },
  getStore(slug: string) {
    return publicApi.get<VendorStoreDto>(`/vendors/store/${slug}`);
  },
  getProducts(slug: string, params?: ProductQueryParams) {
    return publicApi.get<{ store: VendorStoreDto; products: PublicProductResponseDto[] }>(`/vendors/store/${slug}/products`, {
      params,
    });
  },
};

export const vendorAccountService = {
  me() {
    return vendorApi.get<VendorResponseDto>("/vendors/me");
  },
  getAccount() {
    return vendorApi.get<VendorResponseDto>("/vendors/account");
  },
  update(payload: Partial<VendorProfileDto>) {
    return vendorApi.patch<VendorResponseDto>("/vendors/account", payload);
  },
  deactivate() {
    return vendorApi.patch<{ success: boolean }>("/vendors/account/deactivate");
  },
  reactivate() {
    return vendorApi.post<{ success: boolean }>("/vendors/account/reactivate");
  },
  deleteAccount() {
    return vendorApi.delete<{ success: boolean }>("/vendors/account");
  },
};

export const adminVendorService = {
  list(params: ProductQueryParams) {
    return adminApi.get<AdminVendorResponseDto[]>("/admin/vendors", { params });
  },
  approve(id: string) {
    return adminApi.patch<AdminVendorResponseDto>(`/admin/vendors/${id}/approve`);
  },
  verify(id: string) {
    return adminApi.patch<AdminVendorResponseDto>(`/admin/vendors/${id}/verify`);
  },
  setActive(id: string, active: boolean) {
    return adminApi.patch<AdminVendorResponseDto>(
      `/admin/vendors/${id}/${active ? "reactivate" : "deactivate"}`
    );
  },
  delete(id: string) {
    return adminApi.delete<void>(`/admin/vendors/${id}`);
  },
};

export const vendorWalletService = {
  get() {
    return vendorApi.get<VendorWalletResponseDto>("/vendors/wallet");
  },
  getWallet() {
    return vendorApi.get<VendorWalletResponseDto>("/vendors/wallet");
  },
  getTransactions(params?: { page?: number; limit?: number }) {
    return vendorApi.get<{
      data: WalletTransactionResponseDto[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    }>("/vendors/wallet/transactions", { params });
  },
};
