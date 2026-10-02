"use client";

import type { ProductCardDto } from "@/api/dto/product";
import { ProductCard } from "@/component/product/ProductCard";
import { ChevronLeft,ChevronRight } from "lucide-react";
import { useRef } from "react";

interface GoingNutsCarouselProps {
  initialProducts: ProductCardDto[];
}

export function GoingNutsCarousel({ initialProducts }: GoingNutsCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const products = initialProducts ?? [];

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = 340;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -amount : amount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Top Products — Going Nuts
        </h2>

        {/* Carousel Navigation (< >) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Previous products"
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Next products"
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground hover:bg-secondary transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel Container */}
      <div
        ref={scrollRef}
        className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x"
      >
        {products.length === 0 ? (
          <div className="w-full py-16 text-center text-sm text-muted-foreground border border-dashed rounded-2xl">
            No products available at the moment.
          </div>
        ) : (
          products.map((product: ProductCardDto) => (
            <div
              key={product.id}
              className="w-[230px] sm:w-[270px] shrink-0 snap-start"
            >
              <ProductCard
                product={product}
                addedFrom="CATEGORY_PAGE"
                size="lg"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
