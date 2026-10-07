import {
  serverGetCategories,
  serverGetCategoryByPath,
  serverGetProductBySlug,
  serverGetProductReviews,
  serverGetProducts,
} from "@/api/server";
import type { CategoryResponseDto } from "@/api/dto/category";
import { CategoryBrowseView } from "@/component/category/CategoryBrowseView";
import { ProductDetailView } from "@/component/product/ProductDetailView";
import { findCategoryBreadcrumbs, resolveCategoryPath } from "@/lib/cart-path";
import { resolveCategoryRoute } from "@/lib/category-route";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface CatchAllCategoryPageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{
    search?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
    inStock?: string;
  }>;
}

type ResolvedPage =
  | {
      kind: "category";
      categories: CategoryResponseDto[];
      category: CategoryResponseDto;
      categorySlugs: string[];
    }
  | {
      kind: "product";
      categories: CategoryResponseDto[];
      category: CategoryResponseDto;
      categorySlugs: string[];
      product: NonNullable<Awaited<ReturnType<typeof serverGetProductBySlug>>>;
    }
  | { kind: "not-found"; categories: CategoryResponseDto[] };

async function resolvePage(slugs: string[]): Promise<ResolvedPage> {
  const categories = await serverGetCategories();
  const route = resolveCategoryRoute(resolveCategoryPath(categories, slugs), slugs);

  if (route.kind === "category") {
    return { ...route, categories };
  }

  // The path endpoint handles categories missing from a partial/stale category tree.
  const fullPathCategory = await serverGetCategoryByPath(slugs.join("/"));
  if (fullPathCategory) {
    return {
      kind: "category",
      categories,
      category: fullPathCategory,
      categorySlugs: slugs,
    };
  }

  if (slugs.length > 1) {
    const parentSlugs = slugs.slice(0, -1);
    const parentCategory = await serverGetCategoryByPath(parentSlugs.join("/"));
    if (parentCategory) {
      const productSlug = slugs[slugs.length - 1];
      const product = productSlug ? await serverGetProductBySlug(productSlug) : null;
      return product
        ? {
            kind: "product",
            categories,
            category: parentCategory,
            categorySlugs: parentSlugs,
            product,
          }
        : { kind: "not-found", categories };
    }
  }

  if (route.kind === "product") {
    const product = await serverGetProductBySlug(route.productSlug);
    return product
      ? { ...route, categories, product }
      : { kind: "not-found", categories };
  }

  return { kind: "not-found", categories };
}

function getCategoryBreadcrumbs(
  category: CategoryResponseDto,
  categories: CategoryResponseDto[],
): { name: string; href: string }[] {
  const treeBreadcrumbs = findCategoryBreadcrumbs(category.id || category.slug, categories);
  if (treeBreadcrumbs?.length) return treeBreadcrumbs;

  return (category.breadcrumbs ?? []).map((breadcrumb) => {
    const path = breadcrumb.path || breadcrumb.slug;
    const segments = path.startsWith("/category/")
      ? path.slice("/category/".length).split("/")
      : path.split("/");
    return {
      name: breadcrumb.name,
      href: `/category/${segments.filter(Boolean).map(encodeURIComponent).join("/")}`,
    };
  });
}

export async function generateMetadata({
  params,
}: CatchAllCategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await resolvePage(Array.isArray(slug) ? slug : [slug]);

  if (page.kind === "category") {
    return {
      title: `${page.category.name} | NUTS-P Marketplace`,
      description:
        page.category.description ||
        `Shop authentic items in ${page.category.name} on NUTS-P.`,
    };
  }

  if (page.kind === "product") {
    return {
      title: `${page.product.name} | NUTS-P Marketplace`,
      description:
        page.product.description ||
        `Buy ${page.product.name} directly from verified vendors on NUTS-P.`,
    };
  }

  return {
    title: "Category | NUTS-P Marketplace",
    description: "Explore curated collections and independent vendors on NUTS-P.",
  };
}

export default async function CategoryPathPage({
  params,
  searchParams,
}: CatchAllCategoryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const slugs = Array.isArray(slug) ? slug : [slug];
  const page = await resolvePage(slugs);

  if (page.kind === "not-found") notFound();

  if (page.kind === "product") {
    const reviews = await serverGetProductReviews(page.product.id);
    const categoryPath = `/category/${page.categorySlugs
      .map(encodeURIComponent)
      .join("/")}`;
    const fullPath = `${categoryPath}/${encodeURIComponent(page.product.slug)}`;

    return (
      <ProductDetailView
        slug={page.product.slug}
        initialProduct={page.product}
        initialReviews={reviews}
        categories={page.categories}
        addedFrom="CATEGORY_PAGE"
        fullPath={fullPath}
        breadcrumbs={getCategoryBreadcrumbs(page.category, page.categories)}
      />
    );
  }

  const products = await serverGetProducts({
    categoryId: page.category.id,
    category: page.category.slug,
    limit: 100,
    search: query.search,
    sort: query.sort || "newest",
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: query.inStock,
  });

  return (
    <CategoryBrowseView
      key={page.categorySlugs.join("/")}
      slugs={page.categorySlugs}
      initialCategories={page.categories}
      initialCategoryNode={page.category}
      initialProducts={products.data}
      initialSearchParams={{
        search: query.search || "",
        sort: query.sort || "newest",
        minPrice: query.minPrice || "",
        maxPrice: query.maxPrice || "",
        inStock: query.inStock === "true",
      }}
    />
  );
}
