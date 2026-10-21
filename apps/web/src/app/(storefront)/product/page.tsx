import { serverGetCategories,serverGetProducts } from "@/api/server";
import { ProductCatalogView } from "@/component/product/ProductCatalogView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Products | NUTS-P Marketplace",
  description: "Explore authentic products from vetted independent vendors across Nigeria.",
};

export default async function ProductCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
    inStock?: string;
  }>;
}) {
  const params = await searchParams;

  const [categories, productsResult] = await Promise.all([
    serverGetCategories(),
    serverGetProducts({
      limit: 24,
      search: params.search,
      sort: params.sort || "newest",
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      inStock: params.inStock,
    }),
  ]);

  return (
    <ProductCatalogView
      initialCategories={categories}
      initialProducts={productsResult.data}
      initialMeta={productsResult.meta ?? undefined}
      initialFilters={{
        search: params.search || "",
        sort: params.sort || "newest",
        minPrice: params.minPrice || "",
        maxPrice: params.maxPrice || "",
        inStock: params.inStock === "true",
      }}
    />
  );
}
