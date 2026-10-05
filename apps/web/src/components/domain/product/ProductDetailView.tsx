"use client";

import { RemoteImage } from "@/component/ui/RemoteImage";
import { productService } from "@/api";
import type { AddedFromType } from "@/api/dto/cart";
import type { CategoryResponseDto } from "@/api/dto/category";
import type { PublicProductResponseDto,PublicVariantSummaryDto } from "@/api/dto/product";
import type { ProductReviewsMetaDto, ReviewResponseDto } from "@/api/dto/review";
import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { ProductReviews } from "@/component/review/ProductReviews";
import { Button } from "@/component/ui/button";
import { useCart } from "@/hook/use-cart";
import { useWishlist } from "@/hook/use-wishlist";
import { findCategoryBreadcrumbs } from "@/lib/cart-path";
import { queryKey } from "@/lib/query-key";
import { getApiErrorMessage } from "@/lib/api-error";
import { formatPrice } from "@/lib/util";
import { useAuthStore } from "@/zustand/auth";
import { useQuery } from "@tanstack/react-query";
import {
ChevronDown,
ChevronRight,
ChevronUp,
Heart,
Minus,
Plus,
Share2,
ShoppingBag,
Truck
} from "lucide-react";
import Link from "next/link";
import { useMemo,useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export interface ProductDetailViewProps {
  slug: string;
  addedFrom?: AddedFromType;
  breadcrumbs?: BreadcrumbItem[];
  fullPath?: string;
  initialProduct?: PublicProductResponseDto;
  initialReviews?: { data: ReviewResponseDto[]; meta?: ProductReviewsMetaDto } | null;
  categories?: CategoryResponseDto[];
  /** When true, renders without the outer CustomerLayout wrapper (for embedding inside another layout page) */
  noLayout?: boolean;
}

export function ProductDetailView({
  slug,
  addedFrom = "PRODUCT_PAGE",
  breadcrumbs,
  fullPath,
  initialProduct,
  initialReviews,
  categories,
  noLayout = false,
}: ProductDetailViewProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const {
    toggleItem,
    isInWishlist,
    isTogglePending: isWishlistPending,
  } = useWishlist();
  const { addItem: addToCart } = useCart();

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  // Accordion state (default closed per user requirement)
  const [aboutVendorOpen, setAboutVendorOpen] = useState(false);
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: queryKey.product.detail(slug),
    queryFn: async () => {
      const { data } = await productService.getBySlug(slug);
      return data;
    },
    initialData: initialProduct || undefined,
    staleTime: 1000 * 60 * 5,
    enabled: !!slug,
  });

  const getVariantLabel = (v?: PublicVariantSummaryDto | null) => {
    if (!v) return "";
    if (v.name) return v.name;
    if (Array.isArray(v.options) && v.options.length > 0) {
      return v.options.map((opt) => opt.value || opt.name).join(" / ");
    }
    return "Standard";
  };

  const variantOptionGroups = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const variant of product?.variants ?? []) {
      for (const option of variant.options ?? []) {
        if (!groups.has(option.name)) groups.set(option.name, new Set());
        groups.get(option.name)!.add(option.value);
      }
    }
    return Array.from(groups, ([name, values]) => ({ name, values: Array.from(values) }));
  }, [product?.variants]);

  const defaultVariant = product?.variants?.find((variant) => variant.inStock && variant.stock > 0)
    ?? product?.variants?.[0];

  const defaultOptions = useMemo(() => {
    return Object.fromEntries(
      defaultVariant?.options?.map(({ name, value }) => [name, value]) ?? []
    );
  }, [defaultVariant]);

  const effectiveSelectedOptions = useMemo(() => {
    return { ...defaultOptions, ...selectedOptions };
  }, [defaultOptions, selectedOptions]);

  const variants = useMemo(() => product?.variants ?? [], [product?.variants]);

  const selectedVariant = useMemo(() => {
    if (!variants.length || variantOptionGroups.length === 0) return null;
    return (
      variants.find((variant) =>
        variantOptionGroups.every(({ name }) =>
          variant.options?.some(
            (option) =>
              option.name === name &&
              option.value === effectiveSelectedOptions[name]
          )
        )
      ) ?? null
    );
  }, [variants, variantOptionGroups, effectiveSelectedOptions]);

  const handleSelectOption = (groupName: string, optionValue: string) => {
    if (!variants.length) return;

    const candidateOptions = {
      ...effectiveSelectedOptions,
      [groupName]: optionValue,
    };

    let matched = variants.find((variant) =>
      variantOptionGroups.every(({ name }) =>
        variant.options?.some(
          (opt) => opt.name === name && opt.value === candidateOptions[name]
        )
      )
    );

    if (!matched) {
      matched =
        variants.find(
          (v) =>
            v.inStock &&
            v.stock > 0 &&
            v.options?.some(
              (opt) => opt.name === groupName && opt.value === optionValue
            )
        ) ??
        variants.find((v) =>
          v.options?.some(
            (opt) => opt.name === groupName && opt.value === optionValue
          )
        );
    }

    if (matched?.options?.length) {
      const newSelections = Object.fromEntries(
        matched.options.map((opt) => [opt.name, opt.value])
      );
      setSelectedOptions(newSelections);
    } else {
      setSelectedOptions((current) => ({
        ...current,
        [groupName]: optionValue,
      }));
    }

    setSelectedImageIndex(0);
    setQuantity(1);
  };

  const effectiveBreadcrumbs = useMemo(() => {
    if (breadcrumbs && breadcrumbs.length > 0) return breadcrumbs;
    const targetSlug =
      product?.subcategory?.slug ||
      product?.parentSubcategory?.slug ||
      product?.category?.slug;
    if (targetSlug && categories && categories.length > 0) {
      const resolved = findCategoryBreadcrumbs(
        targetSlug,
        categories
      );
      if (resolved && resolved.length > 0) return resolved;
    }
    return undefined;
  }, [breadcrumbs, product, categories]);

  if (isLoading) {
    const skeleton = (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-3xl bg-neutral-100" />
          <div className="space-y-6">
            <div className="h-8 w-2/3 animate-pulse rounded-xl bg-neutral-100" />
            <div className="h-6 w-1/3 animate-pulse rounded-xl bg-neutral-100" />
            <div className="h-24 w-full animate-pulse rounded-xl bg-neutral-100" />
            <div className="h-12 w-full animate-pulse rounded-xl bg-neutral-100" />
          </div>
        </div>
      </div>
    );
    return noLayout ? skeleton : <CustomerLayout categories={categories}>{skeleton}</CustomerLayout>;
  }

  if (!product) {
    const notFound = (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center">
        <h2 className="text-3xl font-bold text-foreground">Product Not Found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The product you are looking for does not exist or has been removed.
        </p>
        <Button asChild className="mt-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/product">Explore All Products</Link>
        </Button>
      </div>
    );
    return noLayout ? notFound : <CustomerLayout categories={categories}>{notFound}</CustomerLayout>;
  }

  const p = product;
  const images: string[] = [];
  if (selectedVariant?.images?.length) {
    selectedVariant.images.forEach((img) => {
      if (img && !images.includes(img)) images.push(img);
    });
  }
  if (p.images?.length) {
    p.images.forEach((img) => {
      const url = typeof img === "string" ? img : img?.url;
      if (url && !images.includes(url)) images.push(url);
    });
  } else if (p.imageUrl && !images.includes(p.imageUrl)) {
    images.push(p.imageUrl);
  }

  const activeImage = images[selectedImageIndex] || images[0];

  const basePrice = Number(selectedVariant?.price ?? p.price ?? 0);
  const originalPrice =
    p.discountPrice && Number(p.discountPrice) > basePrice
      ? Number(p.discountPrice)
      : null;
  const discountPercent = originalPrice
    ? Math.round(((originalPrice - basePrice) / originalPrice) * 100)
    : 0;

  const stock = selectedVariant?.stock ?? (p.hasVariants ? 0 : p.stock ?? 0);
  const isOutOfStock = stock <= 0;
  const isLiked = isInWishlist(p.id, selectedVariant?.id);

  const nextImage = () => {
    if (images.length > 1) {
      setSelectedImageIndex((prev) => (prev + 1) % images.length);
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: p.name,
          text: p.description ?? undefined,
          url: window.location.href,
        });
      } catch {
        // Ignored if user cancels share
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

  function handleAddToCart() {
    if (!isAuthenticated) {
      toast.error("Please sign in to add items to your cart");
      return;
    }
    if (p.hasVariants && !selectedVariant) {
      toast.error("Select an option before adding this product");
      return;
    }
    if (isOutOfStock) {
      toast.error("This item is currently out of stock");
      return;
    }

    const currentPath =
      fullPath || (addedFrom === "CATEGORY_PAGE" ? window.location.pathname : `/product/${p.slug}`);

    const variantName = selectedVariant ? getVariantLabel(selectedVariant) : undefined;

    addToCart.mutate(
      {
        productId: p.id,
        quantity,
        price: basePrice,
        productName: p.name,
        productSlug: p.slug,
        variantId: selectedVariant?.id,
        variantName,
        addedFrom,
        path: currentPath,
      },
      {
        onSuccess: () => {
          toast.success(
            `Added ${quantity} × "${p.name}" to cart!`,
            {
              action: {
                label: "View Cart",
                onClick: () => {
                  router.push("/cart");
                },
              },
            }
          );
        },
        onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Unable to add this item to your cart")),
      }
    );
  }

  async function handleWishlist() {
    try {
      const added = await toggleItem(
        {
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: basePrice,
          discountPrice: originalPrice,
          thumbnail: activeImage || p.imageUrl,
          vendor: p.vendor,
        },
        selectedVariant?.id
      );
      if (added) {
        toast.success("Saved to wishlist");
      } else {
        toast.info("Removed from wishlist");
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Unable to update wishlist"));
    }
  }

  const vendorDescription =
    (p.vendor && "storeDescription" in p.vendor
      ? (p.vendor as { storeDescription?: string | null }).storeDescription
      : null)?.trim() || null;

  const content = (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Dynamic Breadcrumb Trail */}
      <nav
        className="mb-8 flex flex-wrap items-center gap-2 sm:gap-2.5 text-sm sm:text-base"
        aria-label="Breadcrumb"
      >
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors font-medium hover:underline underline-offset-4"
        >
          Home
        </Link>

        {effectiveBreadcrumbs && effectiveBreadcrumbs.length > 0 ? (
          effectiveBreadcrumbs.map((crumb, idx) => (
            <span key={crumb.href || idx} className="flex items-center gap-2 sm:gap-2.5">
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors font-medium hover:underline underline-offset-4"
              >
                {crumb.name}
              </Link>
            </span>
          ))
        ) : (
          <span className="flex items-center gap-2 sm:gap-2.5">
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
            <Link
              href="/product"
              className="text-muted-foreground hover:text-foreground transition-colors font-medium hover:underline underline-offset-4"
            >
              Products
            </Link>
          </span>
        )}

        <span className="flex items-center gap-2 sm:gap-2.5">
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
          <span className="text-foreground font-bold line-clamp-1 max-w-xs sm:max-w-md">
            {p.name}
          </span>
        </span>
      </nav>

      {/* ─── Main Product Details Grid (Screenshot 6 Layout) ─── */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left Column: Image Viewport & Thumbnails */}
        <div className="flex flex-col gap-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-[#f7f7f8] flex items-center justify-center">
            {activeImage ? (
              <RemoteImage
                src={activeImage}
                alt={p.name}
                className="h-full w-full object-contain p-6 transition-all duration-300"
                priority
                loading="eager"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                <ShoppingBag className="h-20 w-20 stroke-[1.2]" />
              </div>
            )}

              {/* Floating Next Image Arrow (Screenshot 6) */}
              {images.length > 1 && (
                <button
                  type="button"
                  onClick={nextImage}
                  aria-label="Next image"
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md text-neutral-800 hover:scale-110 active:scale-95 transition-all"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}

              {/* Discount Badge */}
              {discountPercent > 0 && (
                <div className="absolute left-4 top-4">
                  <span className="rounded-md bg-black px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                    -{discountPercent}% OFF
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnail Strip with Active Line Indicator */}
            {images.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
                {images.map((img, idx) => {
                  const isActive = selectedImageIndex === idx;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedImageIndex(idx)}
                        aria-label={`View image ${idx + 1}`}
                        className={`relative h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-xl bg-[#f7f7f8] dark:bg-neutral-900 p-1 border transition-all ${
                          isActive
                            ? "border-black dark:border-white shadow-xs"
                            : "border-border/60 opacity-60 hover:opacity-100"
                        }`}
                      >
                        
                        <RemoteImage
                          src={img}
                          alt={`${p.name} view ${idx + 1}`}
                          className="h-full w-full object-contain"
                        />
                      </button>
                      {/* Active line indicator under thumbnail */}
                      <div
                        className={`h-0.5 sm:h-1 rounded-full transition-all duration-200 ${
                          isActive
                            ? "w-8 sm:w-10 bg-black dark:bg-white"
                            : "w-0 bg-transparent"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Title, Actions, Price, Accordions (Screenshot 6) */}
          <div className="flex flex-col">
            {/* Header: Title & Action Icons */}
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
                {p.name}
              </h1>

              <div className="flex items-center gap-2 shrink-0 pt-1">
                <button
                  type="button"
                  onClick={handleWishlist}
                  aria-label="Save to wishlist"
                  className="p-1.5 text-foreground hover:text-neutral-600 transition-colors"
                >
                  <Heart
                    className={`h-5 w-5 ${
                      isLiked ? "fill-black text-black" : "stroke-[1.6]"
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  aria-label="Share product"
                  className="p-1.5 text-foreground hover:text-neutral-600 transition-colors"
                >
                  <Share2 className="h-5 w-5 stroke-[1.6]" />
                </button>
              </div>
            </div>

            {/* Vendor Badge & Link */}
            {p.vendor?.storeName && (
              <div className="mt-3 flex items-center gap-2">
                <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black text-xs font-bold shrink-0">
                  ✓
                </span>
                <Link
                  href={`/vendor/${p.vendor.storeSlug || ""}`}
                  className="text-sm sm:text-base font-semibold text-neutral-800 dark:text-neutral-200 hover:text-black dark:hover:text-white underline underline-offset-4 transition-colors"
                >
                  {p.vendor.storeName}
                </Link>
              </div>
            )}

            {/* Short Excerpt */}
            {p.description && (
              <p className="mt-3.5 text-base sm:text-lg text-muted-foreground leading-relaxed line-clamp-3">
                {p.description}
              </p>
            )}

            {/* Price */}
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
                {formatPrice(basePrice)}
              </span>
              {originalPrice && (
                <span className="text-lg sm:text-xl text-muted-foreground line-through">
                  {formatPrice(originalPrice)}
                </span>
              )}
            </div>

            {/* Delivery Estimate & Out of Stock Status */}
            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-sm sm:text-base font-medium text-amber-600 dark:text-amber-500">
                <Truck className="h-4.5 w-4.5 shrink-0" />
                <span>Est. delivery time: 24 hours</span>
              </div>
              {isOutOfStock && (
                <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-rose-600 dark:text-rose-400">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  <span>Out of stock</span>
                </div>
              )}
            </div>

            {/* Variants Selector (if applicable) */}
            {variantOptionGroups.length > 0 && (
              <div className="mt-7 space-y-5">
                {variantOptionGroups.map(({ name, values }) => (
                  <fieldset key={name} className="space-y-2.5">
                    <legend className="text-sm sm:text-base font-semibold text-foreground">
                      {name}: <span className="font-normal text-muted-foreground">{effectiveSelectedOptions[name] ?? "Choose an option"}</span>
                    </legend>
                    <div className="flex flex-wrap gap-2.5">
                      {values.map((value) => {
                        const isSelected = effectiveSelectedOptions[name] === value;
                        const isAvailable = variants.some((v) =>
                          v.options?.some((opt) => opt.name === name && opt.value === value)
                        );
                        const hasStock = variants.some((v) =>
                          v.inStock &&
                          v.stock > 0 &&
                          v.options?.some((opt) => opt.name === name && opt.value === value)
                        );
                        return (
                          <button
                            key={`${name}:${value}`}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={!isAvailable}
                            onClick={() => handleSelectOption(name, value)}
                            className={`rounded-xl border px-4 py-2 text-sm sm:text-base font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground shadow-xs font-semibold"
                                : "border-border bg-card text-foreground hover:border-foreground/40"
                            } ${!hasStock && !isSelected ? "opacity-60" : ""}`}
                          >
                            <span className="capitalize">{value}</span>
                            {!hasStock && (
                              <span className="ml-1.5 text-[11px] font-normal opacity-70">(Out of stock)</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                {Object.keys(effectiveSelectedOptions).length === variantOptionGroups.length && !selectedVariant && (
                  <p className="text-sm text-muted-foreground">This option combination is unavailable.</p>
                )}
              </div>
            )}

            {/* Quantity Stepper & Add to Cart Row (Screenshot 6) */}
            <div className="mt-8 flex items-center gap-3">
              {/* Stepper [- 1 +] */}
              <div className="flex items-center rounded-xl bg-secondary p-1">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1 || isOutOfStock}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-card disabled:opacity-30 transition-all"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center text-base sm:text-lg font-bold text-foreground">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={quantity >= stock || isOutOfStock}
                  onClick={() => setQuantity((q) => Math.min(stock, q + 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-card disabled:opacity-30 transition-all"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Add to Cart Pill Button */}
              <Button
                size="lg"
                disabled={isOutOfStock || (p.hasVariants && !selectedVariant) || addToCart.isPending}
                onClick={handleAddToCart}
                className="flex-1 h-12 sm:h-14 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-base sm:text-lg font-bold shadow-xs transition-all"
              >
                {isOutOfStock
                  ? "Sold Out"
                  : `Add to cart • ${formatPrice(basePrice * quantity)}`}
              </Button>
            </div>

            {/* ─── Expandable Accordions (Screenshot 6) ─── */}
            <div className="mt-10 divide-y divide-border/60 border-t border-border/60">
              {/* About the vendor Accordion */}
              <div className="py-5">
                <button
                  type="button"
                  onClick={() => setAboutVendorOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-base text-lg font-bold text-foreground transition-colors hover:text-neutral-600"
                >
                  <span>About the vendor</span>
                  {aboutVendorOpen ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>

                {aboutVendorOpen && (
                  <div className="mt-3.5 text-sm sm:text-lg leading-relaxed text-neutral-700 dark:text-neutral-300 animate-in fade-in-0 duration-200">
                    <p>{vendorDescription || "No description provided by this vendor yet."}</p>
                    {p.vendor?.storeSlug && (
                      <Link
                        href={`/vendor/${p.vendor.storeSlug}`}
                        className="mt-3 inline-block font-semibold text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
                      >
                        Visit Vendor Store &rarr;
                      </Link>
                    )}
                  </div>
                )}
              </div>

              {/* Product Details Accordion */}
              <div className="py-5">
                <button
                  type="button"
                  onClick={() => setProductDetailsOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-base sm:text-lg font-bold text-foreground transition-colors hover:text-neutral-600"
                >
                  <span>Product Details</span>
                  {productDetailsOpen ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>

                {productDetailsOpen && (
                  <div className="mt-3.5 text-sm sm:text-lg leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-line animate-in fade-in-0 duration-200">
                    <p>
                      {p.description ||
                        "Handcrafted and curated with care by independent vendors."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Customer Reviews Section ─── */}
        <ProductReviews
          productId={p.id}
          averageRating={p.averageRating}
          reviewCount={p.reviewCount}
          initialReviews={initialReviews}
        />

        {/* ─── Sticky Mobile Add-to-Cart Bar (Instant Purchase on Mobile) ─── */}
        <div className="lg:hidden fixed bottom-14 sm:bottom-0 left-0 right-0 z-30 border-t border-border/80 bg-background/95 backdrop-blur-md px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-muted-foreground truncate">{p.name}</span>
              <span className="text-base font-bold text-foreground">
                {formatPrice(basePrice * quantity)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleWishlist}
                aria-label={isLiked ? "Remove from wishlist" : "Add to wishlist"}
                disabled={isWishlistPending}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary/80 text-foreground transition-colors hover:bg-secondary shrink-0"
              >
                <Heart
                  className={`h-4.5 w-4.5 ${
                    isLiked ? "fill-primary text-primary" : "stroke-[1.6]"
                  } ${isWishlistPending ? "animate-pulse" : ""}`}
                />
              </button>

              <Button
                size="default"
                disabled={isOutOfStock || (p.hasVariants && !selectedVariant) || addToCart.isPending}
                onClick={handleAddToCart}
                className="h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm font-bold px-4 shadow-xs transition-all shrink-0"
              >
                {isOutOfStock ? "Sold Out" : "Add to Cart"}
              </Button>
            </div>
          </div>
        </div>
      </div>
  );

  return noLayout ? content : <CustomerLayout categories={categories}>{content}</CustomerLayout>;
}
