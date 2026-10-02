import { api } from "@/api/core/client";
import type { CategoryResponseDto } from "@/api/dto/category";
import type {
AdminProductResponseDto,
ProductCardDto,
ProductSummaryDto,
PublicProductResponseDto,
VendorProductResponseDto,
} from "@/api/dto/product";
import type { VendorVariantResponseDto } from "@/api/dto/variant";

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  slug?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  [key: string]: unknown;
}

export interface CursorQueryBody {
  cursor?: string;
  take?: number;
  filter?: Record<string, unknown>;
  sort?: string;
}

export interface CreateProductPayload {
  name: string;
  description?: string;
  sku?: string;
  categoryId?: string;
  price?: number;
  stock?: number;
  images?: { url: string; publicId: string; isCover?: boolean }[];
  hasVariants?: boolean;
  variants?: {
    options: { name: string; value: string }[];
    stock?: number;
    price?: number;
    images?: string[];
  }[];
  variantCombinations?: Record<string, string[]>;
  isActive?: boolean;
}

export type UpdateProductPayload = Partial<CreateProductPayload>;

export interface UpdateStockPayload {
  quantity: number;
  description?: string;
}

export const productService = {
  getBySlug(slug: string) {
    return api.get<PublicProductResponseDto>(`/products/${slug}`);
  },
  getCards(params: ProductQueryParams) {
    return api.get<ProductCardDto[]>("/products", { params });
  },
  query(body: CursorQueryBody) {
    return api.post<{ items: ProductCardDto[]; nextCursor?: string | null }>(
      "/products/query",
      body
    );
  },
};

export const dashboardProductService = {
  list(params: ProductQueryParams) {
    return api.get<VendorProductResponseDto[]>("/vendors/products", { params });
  },
  getBySlug(slug: string) {
    return api.get<VendorProductResponseDto>(`/vendors/products/${slug}`);
  },
  create(payload: CreateProductPayload) {
    return api.post<VendorProductResponseDto>("/vendors/products", payload);
  },
  update(id: string, payload: UpdateProductPayload) {
    return api.patch<VendorProductResponseDto>(`/vendors/products/${id}`, payload);
  },
  setActive(id: string, active: boolean) {
    return api.patch<VendorProductResponseDto>(
      `/vendors/products/${id}/${active ? "reactivate" : "deactivate"}`
    );
  },
  updateStock(id: string, payload: UpdateStockPayload) {
    return api.patch<VendorProductResponseDto>(
      `/vendors/products/${id}/stock`,
      payload
    );
  },
  permanentDelete(id: string) {
    return api.delete<void>(`/vendors/products/${id}/permanent`);
  },
  listVariants(productId: string) {
    return api.get<{ variants?: VendorVariantResponseDto[] } | VendorVariantResponseDto[]>(
      `/vendors/products/variants?productId=${productId}`
    );
  },
};

export const vendorProductService = dashboardProductService;

export const adminProductService = {
  list(params: ProductQueryParams) {
    return api.get<AdminProductResponseDto[]>("/admin/products", { params });
  },
  getById(id: string) {
    return api.get<AdminProductResponseDto>(`/admin/products/${id}`);
  },
  create(payload: CreateProductPayload) {
    return api.post<AdminProductResponseDto>("/admin/products", payload);
  },
  update(id: string, payload: UpdateProductPayload) {
    return api.patch<AdminProductResponseDto>(`/admin/products/${id}`, payload);
  },
  setActive(id: string, active: boolean) {
    return api.patch<AdminProductResponseDto>(
      `/admin/products/${id}/${active ? "reactivate" : "deactivate"}`
    );
  },
  updateStock(id: string, payload: UpdateStockPayload) {
    return api.patch<AdminProductResponseDto>(`/admin/products/${id}/stock`, payload);
  },
  delete(id: string) {
    return api.delete<void>(`/admin/products/${id}`);
  },
};

export const productSummaryService = {
  list(params: { subcategory?: string; sort?: string; limit?: number }) {
    return api.get<ProductSummaryDto[]>("/products", { params });
  },
};

export type { CategoryResponseDto };
