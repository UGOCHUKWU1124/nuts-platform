import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { CacheService } from 'src/modules/infrastructure/cache/cache.service';

import { PrismaService } from 'src/modules/infrastructure/prisma/prisma.service';

import { WishlistResponseDto } from './dto/wishlist.dto';

const WISHLIST_CACHE_PREFIX = 'user:wishlist:v3:';

const WISHLIST_CACHE_TTL = 120;

/*
 * Keep the query intentionally small.
 *
 * Wishlist pages normally need a product card, not the entire product
 * entity with every relationship.
 */
const WISHLIST_ITEM_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      hasVariants: true,

      images: {
        select: {
          url: true,
        },
        orderBy: {
          position: 'asc' as const,
        },
        take: 1,
      },
    },
  },

  variant: {
    select: {
      id: true,
      options: true,
    },
  },
} satisfies Prisma.WishlistItemInclude;

type WishlistItemWithRelations = Prisma.WishlistItemGetPayload<{
  include: typeof WISHLIST_ITEM_INCLUDE;
}>;

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // ADD
  // ---------------------------------------------------------------------------

  async add(
    userId: string,
    productId: string,
    variantId?: string,
  ): Promise<WishlistResponseDto> {
    const normalizedVariantId = this.normalizeVariantId(variantId);

    /*
     * One product query validates:
     *
     * 1. product exists
     * 2. product is active
     * 3. product is not deleted
     * 4. requested variant belongs to this product
     * 5. requested variant is active
     * 6. requested variant is not deleted
     *
     * This is cleaner than doing separate product + variant queries.
     */
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        isDeleted: false,

        ...(normalizedVariantId
          ? {
              variants: {
                some: {
                  id: normalizedVariantId,
                  isActive: true,
                  isDeleted: false,
                },
              },
            }
          : {}),
      },

      select: {
        id: true,
        hasVariants: true,

        /*
         * Only return the variant ID we actually need for validation.
         */
        variants: normalizedVariantId
          ? {
              where: {
                id: normalizedVariantId,
                isActive: true,
                isDeleted: false,
              },

              select: {
                id: true,
              },

              take: 1,
            }
          : false,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found or unavailable');
    }

    if (product.hasVariants && !normalizedVariantId) {
      throw new ConflictException('Please select a product variant');
    }

    if (!product.hasVariants && normalizedVariantId) {
      throw new ConflictException('This product does not support variants');
    }

    if (normalizedVariantId && product.variants.length === 0) {
      throw new NotFoundException('Product variant not found or unavailable');
    }

    try {
      /*
       * The database unique constraint is the final authority for duplicate
       * wishlist items.
       *
       * Do NOT rely on "find first, then create" because two concurrent
       * requests could both pass the check.
       */
      const item = await this.prisma.wishlistItem.create({
        data: {
          userId,
          productId,
          variantId: normalizedVariantId,
        },

        include: WISHLIST_ITEM_INCLUDE,
      });

      await this.invalidateCache(userId);

      return this.toResponseDto(item);
    } catch (error) {
      /*
       * Prisma P2002 = unique constraint violation.
       *
       * This handles concurrent duplicate requests safely.
       */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Item already in wishlist');
      }

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // FIND MINE
  // ---------------------------------------------------------------------------

  async findMine(userId: string): Promise<WishlistResponseDto[]> {
    const cacheKey = this.getCacheKey(userId);

    return this.cacheService.wrap(cacheKey, WISHLIST_CACHE_TTL, async () => {
      /*
       * The user ID is part of the WHERE clause, so one user's wishlist
       * can never be returned for another user.
       */
      const items = await this.prisma.wishlistItem.findMany({
        where: {
          userId,

          /*
           * Don't expose deleted/inactive products in the wishlist.
           * They can remain in the DB until the user removes them.
           */
          product: {
            isActive: true,
            isDeleted: false,
          },
        },

        include: WISHLIST_ITEM_INCLUDE,

        orderBy: {
          createdAt: 'desc',
        },

        /*
         * Prevent an unexpectedly huge response.
         *
         * For a larger wishlist, pagination should replace this cap.
         */
        take: 200,
      });

      return items.map((item) => this.toResponseDto(item));
    });
  }

  // ---------------------------------------------------------------------------
  // REMOVE
  // ---------------------------------------------------------------------------

  async remove(
    userId: string,
    productId: string,
    variantId?: string,
  ): Promise<void> {
    const normalizedVariantId = this.normalizeVariantId(variantId);

    /*
     * deleteMany is useful here because:
     *
     * - ownership is checked inside the DELETE query
     * - there is no find-then-delete race
     * - only one database round trip is required
     */
    const result = await this.prisma.wishlistItem.deleteMany({
      where: {
        userId,
        productId,
        variantId: normalizedVariantId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Item not found in wishlist');
    }

    await this.invalidateCache(userId);
  }

  // ---------------------------------------------------------------------------
  // RESPONSE MAPPER
  // ---------------------------------------------------------------------------

  private toResponseDto(item: WishlistItemWithRelations): WishlistResponseDto {
    return {
      id: item.id,

      productId: item.productId,

      variantId: item.variantId,

      productName: item.product.name,

      productSlug: item.product.slug,

      productPrice: Number(item.product.price),

      productImage: item.product.images[0]?.url ?? null,

      variantName: this.getVariantName(item.variant?.options),

      createdAt: item.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // VARIANT OPTIONS
  // ---------------------------------------------------------------------------

  private getVariantName(options: unknown): string | null {
    if (!options) {
      return null;
    }

    /*
     * Current variant option format:
     *
     * [
     *   { name: "Color", value: "Black" },
     *   { name: "Size", value: "M" }
     * ]
     */
    if (Array.isArray(options)) {
      const values = options
        .filter(
          (option) =>
            typeof option === 'object' && option !== null && 'value' in option,
        )
        .map((option) =>
          String(
            (
              option as {
                value: unknown;
              }
            ).value,
          ),
        );

      return values.length ? values.join(', ') : null;
    }

    /*
     * Legacy format:
     *
     * {
     *   color: "Black",
     *   size: "M"
     * }
     */
    if (typeof options === 'object') {
      return Object.values(options as Record<string, unknown>)
        .map(String)
        .join(', ');
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // CACHE
  // ---------------------------------------------------------------------------

  private getCacheKey(userId: string): string {
    return `${WISHLIST_CACHE_PREFIX}${userId}`;
  }

  private async invalidateCache(userId: string): Promise<void> {
    await this.cacheService.del(this.getCacheKey(userId));
  }

  // ---------------------------------------------------------------------------
  // NORMALIZATION
  // ---------------------------------------------------------------------------

  private normalizeVariantId(
    variantId: string | undefined | null,
  ): string | null {
    const normalized = variantId?.trim();

    return normalized || null;
  }
}
