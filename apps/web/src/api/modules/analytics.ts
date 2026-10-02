import { api } from "@/api/core/client";
import type {
ActivityAnalyticsDto,
AdminAnalyticsSummaryDto,
AdminQueryAnalyticsDto,
DiscountAnalyticsDto,
FunnelAnalyticsDto,
PaymentAnalyticsDto,
TopCategoryDto,
TopProductDto,
TopVendorDto,
UserAnalyticsDto,
} from "@/api/dto/admin-analytics";
import type {
VendorAnalyticsSummaryDto,
VendorQueryAnalyticsDto,
} from "@/api/dto/vendor-analytics";

export const adminAnalyticsService = {
  summary(params?: AdminQueryAnalyticsDto) {
    return api.get<AdminAnalyticsSummaryDto>("/admin/analytics/summary", { params });
  },
  topProducts(params?: AdminQueryAnalyticsDto) {
    return api.get<TopProductDto[]>("/admin/analytics/top-products", { params });
  },
  topVendors(params?: AdminQueryAnalyticsDto) {
    return api.get<TopVendorDto[]>("/admin/analytics/top-vendors", { params });
  },
  topCategories(params?: AdminQueryAnalyticsDto) {
    return api.get<TopCategoryDto[]>("/admin/analytics/top-categories", { params });
  },
  payments(params?: AdminQueryAnalyticsDto) {
    return api.get<PaymentAnalyticsDto>("/admin/analytics/payments", { params });
  },
  discounts(params?: AdminQueryAnalyticsDto) {
    return api.get<DiscountAnalyticsDto>("/admin/analytics/discounts", { params });
  },
  funnel(params?: AdminQueryAnalyticsDto) {
    return api.get<FunnelAnalyticsDto>("/admin/analytics/funnel", { params });
  },
  activity(params?: AdminQueryAnalyticsDto) {
    return api.get<ActivityAnalyticsDto>("/admin/analytics/activity", { params });
  },
  userAcquisition(params?: AdminQueryAnalyticsDto) {
    return api.get<UserAnalyticsDto>("/admin/analytics/user-acquisition", { params });
  },
};

export const vendorAnalyticsService = {
  summary(params?: VendorQueryAnalyticsDto) {
    return api.get<VendorAnalyticsSummaryDto>("/vendors/analytics", { params });
  },
};