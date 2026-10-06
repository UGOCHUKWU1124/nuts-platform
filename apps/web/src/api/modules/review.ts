import { api } from "@/api/core/client";
import type {
CreateReviewDto,
ProductReviewsMetaDto,
ReviewResponseDto,
} from "@/api/dto/review";

export const reviewService = {
  listByProduct(productId: string, signal?: AbortSignal) {
    return api.get<ReviewResponseDto[], ProductReviewsMetaDto>(`/reviews/product/${productId}`, { signal });
  },
  create(payload: CreateReviewDto) {
    return api.post<ReviewResponseDto>("/reviews", payload);
  },
  remove(id: string) {
    return api.delete<void>(`/reviews/${id}`);
  },
};