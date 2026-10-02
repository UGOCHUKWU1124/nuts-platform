import { api } from "@/api/core/client";
import type {
QuerySearchBodyDto,
SearchCategoryHitDto,
SearchIndex,
SearchProductHitDto,
SearchProductsResponseDto,
SearchVendorHitDto,
} from "@/api/dto/search";

export type SearchVendorResult = SearchVendorHitDto;

export type SearchCategoryResult = SearchCategoryHitDto;

export interface AdminSearchResult {
  products: SearchProductHitDto[];
  vendors: SearchVendorResult[];
  categories: SearchCategoryResult[];
  users: unknown[];
  orders: unknown[];
  discountCodes: unknown[];
}

export const searchService = {
  query(body: QuerySearchBodyDto) {
    return api.post<SearchProductsResponseDto>("/search/query", body);
  },
  get(params: QuerySearchBodyDto) {
    return api.get<SearchProductsResponseDto>("/search", { params });
  },
  autocomplete(params: { query?: string; types?: SearchIndex[]; limit?: number }) {
    return api.get<SearchProductsResponseDto>("/search/autocomplete", { params });
  },
};

export const adminSearchService = {
  get(params: QuerySearchBodyDto) {
    return api.get<AdminSearchResult>("/admin/search", { params });
  },
};

export const vendorSearchService = {
  get(params: QuerySearchBodyDto) {
    return api.get<AdminSearchResult>("/vendors/search", { params });
  },
};
