import { serverGetCategories,serverGetProducts,serverGetVendors } from "@/api/server";
import { SearchPageView } from "@/component/search/SearchPageView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Products & Vendors | NUTS-P Marketplace",
  description: "Find products, categories, and verified vendors across Nigeria on NUTS-P.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const normalizedQuery = q.trim();
  const [categories, productsResult, vendors] = await Promise.all([
    serverGetCategories(),
    normalizedQuery.length >= 2
      ? serverGetProducts({ search: normalizedQuery, limit: 12 })
      : Promise.resolve({ data: [], meta: null }),
    normalizedQuery.length >= 2
      ? serverGetVendors({ search: normalizedQuery, limit: 4 })
      : Promise.resolve([]),
  ]);

  return (
    <SearchPageView
      key={normalizedQuery}
      categories={categories}
      initialQuery={normalizedQuery}
      initialProducts={productsResult.data}
      initialProductMeta={productsResult.meta && "page" in productsResult.meta ? productsResult.meta : null}
      initialVendors={vendors}
    />
  );
}
