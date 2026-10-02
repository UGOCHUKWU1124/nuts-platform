import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from 'src/modules/infrastructure/prisma/prisma.service';

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  score: number | string;
  total_count: number;
}

interface VendorRow {
  id: string;
  storeName: string;
  storeDescription: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  score: number | string;
  total_count: number;
}

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  score: number | string;
  total_count: number;
}

interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  referralCode: string | null;
  score: number | string;
  total_count: number;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  discountCode: string | null;
  referralCode: string | null;
  shippingAddress: string | null;
  userEmail: string | null;
  score: number | string;
  total_count: number;
}

interface DiscountCodeRow {
  id: string;
  code: string;
  description: string | null;
  score: number | string;
  total_count: number;
}

interface ProductSearchIdRow {
  id: string;
  score: number | string;
  total_count: number;
}

export type SearchIndex =
  | 'products'
  | 'vendors'
  | 'categories'
  | 'users'
  | 'orders'
  | 'discount_codes';

const MARKETPLACE_INDEXES: SearchIndex[] = [
  'products',
  'vendors',
  'categories',
];

const ADMIN_INDEXES: SearchIndex[] = [
  'products',
  'vendors',
  'categories',
  'users',
  'orders',
  'discount_codes',
];

const VENDOR_INDEXES: SearchIndex[] = ['products', 'orders', 'discount_codes'];

const MAX_LIMIT = 50;
const MIN_SEARCH_LENGTH = 2;
const SIMILARITY_THRESHOLD = 0.25;
const CACHE_TTL_SECONDS = 900;

export interface SearchResultItem {
  id: string;
  index: SearchIndex;
  type: string;
  title: string;
  subtitle?: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface SearchResponsePayload {
  results: SearchResultItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SearchProductHit {
  type: string;
  title: string;
  description: string | null;
  image: string | null;
  searchKeywords: string[];
  createdAt: Date;
  updatedAt: Date;
  slug: string;
  price: number;
  vendor: {
    slug: string;
    logo: string | null;
    banner: string | null;
    businessName: string;
  };
  category: {
    id: string;
    slug: string;
    name: string;
  };
  subcategory: {
    id: string;
    slug: string;
    name: string;
  } | null;
  section: string | null;
  hasDiscount: boolean;
  discountDetails: {
    type: 'PERCENTAGE' | 'FIXED';
    value: number;
    maxAmount: number | null;
  } | null;
  objectID: string;
}

export interface SearchProductsResponsePayload {
  hits: SearchProductHit[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // PUBLIC PRODUCT SEARCH
  // ---------------------------------------------------------------------------

  async searchProducts(
    search: string,
    categoryId?: string,
    page = 1,
    limit = 10,
  ): Promise<{
    ids: string[];
    total: number;
  } | null> {
    const normalizedSearch = this.normalizeSearch(search);

    if (normalizedSearch.length < MIN_SEARCH_LENGTH) {
      return null;
    }

    const safePage = this.normalizePage(page);
    const safeLimit = this.normalizeLimit(limit);

    const cacheKey = this.buildCacheKey(
      'products:ids',
      normalizedSearch,
      categoryId ?? 'all',
      safePage,
      safeLimit,
    );

    const cached = await this.getCache<{
      ids: string[];
      total: number;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    const ilikeSearch = `%${normalizedSearch}%`;
    const offset = (safePage - 1) * safeLimit;

    const products = categoryId
      ? await this.prisma.$queryRaw<ProductSearchIdRow[]>`
            SELECT
              id,
              (
                CASE
                  WHEN name ILIKE ${ilikeSearch}
                    THEN 3.0 + similarity(name, ${normalizedSearch})
                  WHEN sku ILIKE ${ilikeSearch}
                    THEN 2.0 + similarity(sku, ${normalizedSearch})
                  ELSE similarity(name, ${normalizedSearch})
                END
              ) AS score,
              COUNT(*) OVER()::integer AS total_count
            FROM products
            WHERE
              "isActive" = true
              AND "isDeleted" = false
              AND "categoryId" = ${categoryId}
              AND (
                name ILIKE ${ilikeSearch}
                OR sku ILIKE ${ilikeSearch}
                OR similarity(name, ${normalizedSearch}) > ${SIMILARITY_THRESHOLD}
                OR similarity(sku, ${normalizedSearch}) > ${SIMILARITY_THRESHOLD}
              )
            ORDER BY score DESC, "createdAt" DESC
            LIMIT ${safeLimit}
            OFFSET ${offset};
          `
      : await this.prisma.$queryRaw<ProductSearchIdRow[]>`
            SELECT
              id,
              (
                CASE
                  WHEN name ILIKE ${ilikeSearch}
                    THEN 3.0 + similarity(name, ${normalizedSearch})
                  WHEN sku ILIKE ${ilikeSearch}
                    THEN 2.0 + similarity(sku, ${normalizedSearch})
                  ELSE similarity(name, ${normalizedSearch})
                END
              ) AS score,
              COUNT(*) OVER()::integer AS total_count
            FROM products
            WHERE
              "isActive" = true
              AND "isDeleted" = false
              AND (
                name ILIKE ${ilikeSearch}
                OR sku ILIKE ${ilikeSearch}
                OR similarity(name, ${normalizedSearch}) > ${SIMILARITY_THRESHOLD}
                OR similarity(sku, ${normalizedSearch}) > ${SIMILARITY_THRESHOLD}
              )
            ORDER BY score DESC, "createdAt" DESC
            LIMIT ${safeLimit}
            OFFSET ${offset};
          `;

    const total = products.length > 0 ? Number(products[0].total_count) : 0;

    const result = {
      ids: products.map((product) => product.id),
      total,
    };

    await this.setCache(cacheKey, result);

    return result;
  }

  // ---------------------------------------------------------------------------
  // DETAILED PRODUCT SEARCH
  // ---------------------------------------------------------------------------

  async searchProductsWithDetails(
    search: string,
    page = 1,
    limit = 10,
  ): Promise<SearchProductsResponsePayload | null> {
    const normalizedSearch = this.normalizeSearch(search);

    if (!normalizedSearch) {
      return null;
    }

    const safePage = this.normalizePage(page);
    const safeLimit = this.normalizeLimit(limit);

    const cacheKey = this.buildCacheKey(
      'products:details',
      normalizedSearch,
      safePage,
      safeLimit,
    );

    const cached = await this.getCache<SearchProductsResponsePayload>(cacheKey);

    if (cached) {
      return cached;
    }

    const ilikeSearch = `%${normalizedSearch}%`;
    const offset = (safePage - 1) * safeLimit;

    const matchedProducts = await this.prisma.$queryRaw<ProductSearchIdRow[]>`
        SELECT
          id,
          (
            CASE
              WHEN name ILIKE ${ilikeSearch}
                THEN 2.0 + similarity(name, ${normalizedSearch})
              WHEN sku ILIKE ${ilikeSearch}
                THEN 1.5 + similarity(sku, ${normalizedSearch})
              WHEN COALESCE(description, '') ILIKE ${ilikeSearch}
                THEN 1.0 + similarity(COALESCE(description, ''), ${normalizedSearch})
              ELSE similarity(name, ${normalizedSearch})
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM products
        WHERE
          "isActive" = true
          AND "isDeleted" = false
          AND (
            name ILIKE ${ilikeSearch}
            OR sku ILIKE ${ilikeSearch}
            OR COALESCE(description, '') ILIKE ${ilikeSearch}
            OR similarity(name, ${normalizedSearch}) > ${SIMILARITY_THRESHOLD}
            OR similarity(sku, ${normalizedSearch}) > ${SIMILARITY_THRESHOLD}
            OR similarity(COALESCE(description, ''), ${normalizedSearch}) > ${SIMILARITY_THRESHOLD}
          )
        ORDER BY score DESC, "createdAt" DESC
        LIMIT ${safeLimit}
        OFFSET ${offset};
      `;

    const total =
      matchedProducts.length > 0 ? Number(matchedProducts[0].total_count) : 0;

    if (matchedProducts.length === 0) {
      const response = {
        hits: [],
        pagination: {
          total: 0,
          page: safePage,
          limit: safeLimit,
          totalPages: 0,
        },
      };

      await this.setCache(cacheKey, response);

      return response;
    }

    const ids = matchedProducts.map((product) => product.id);

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        vendor: {
          select: {
            storeName: true,
            storeSlug: true,
            storeLogoUrl: true,
          },
        },
        images: {
          where: {
            isPrimary: true,
          },
          take: 1,
        },
      },
    });

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    const orderedProducts = ids
      .map((id) => productMap.get(id))
      .filter((product): product is (typeof products)[number] =>
        Boolean(product),
      );

    const hits = orderedProducts.map((product) => ({
      type: 'product',
      title: product.name,
      description: product.description ?? null,
      image: product.images[0]?.url ?? null,
      searchKeywords: [
        product.name,
        product.category.name,
        product.vendor.storeName,
      ].filter((value): value is string => Boolean(value)),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      slug: product.slug,
      price: Number(product.price),
      vendor: {
        slug: product.vendor.storeSlug,
        logo: product.vendor.storeLogoUrl ?? null,
        banner: null,
        businessName: product.vendor.storeName,
      },
      category: {
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
      },
      subcategory: null,
      section: null,
      hasDiscount: false,
      discountDetails: null,
      objectID: product.id,
    }));

    const response = {
      hits,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };

    await this.setCache(cacheKey, response);

    return response;
  }

  // ---------------------------------------------------------------------------
  // MARKETPLACE
  // ---------------------------------------------------------------------------

  async searchMarketplace(
    search: string,
    types?: SearchIndex[],
    page = 1,
    limit = 10,
  ): Promise<SearchResponsePayload | null> {
    return this.executeSearch(
      this.filterIndexes(types, MARKETPLACE_INDEXES),
      search,
      page,
      limit,
    );
  }

  // ---------------------------------------------------------------------------
  // ADMIN
  // ---------------------------------------------------------------------------

  async searchAdminGlobal(
    search: string,
    types?: SearchIndex[],
    page = 1,
    limit = 20,
  ): Promise<SearchResponsePayload | null> {
    /*
     * Admin search actually includes all admin entities.
     *
     * The previous implementation incorrectly used marketplace indexes
     * here, so users/orders/discount codes were never searched.
     */
    return this.executeSearch(
      this.filterIndexes(types, ADMIN_INDEXES),
      search,
      page,
      limit,
    );
  }

  // ---------------------------------------------------------------------------
  // MARKETPLACE AUTOCOMPLETE
  // ---------------------------------------------------------------------------

  async autocomplete(
    search: string,
    types?: SearchIndex[],
    limit = 10,
  ): Promise<SearchResultItem[] | null> {
    const normalizedSearch = this.normalizeSearch(search);

    if (!normalizedSearch) {
      return null;
    }

    const indexes = this.filterIndexes(types, MARKETPLACE_INDEXES);

    const safeLimit = this.normalizeLimit(limit);

    const cacheKey = this.buildCacheKey(
      'autocomplete',
      normalizedSearch,
      indexes.join(','),
      safeLimit,
    );

    const cached = await this.getCache<SearchResultItem[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.executeSearch(
      indexes,
      normalizedSearch,
      1,
      safeLimit,
    );

    if (!result) {
      return null;
    }

    await this.setCache(cacheKey, result.results);

    return result.results;
  }

  // ---------------------------------------------------------------------------
  // VENDOR SEARCH
  // ---------------------------------------------------------------------------

  async searchVendorGlobal(
    vendorId: string,
    search: string,
    types?: SearchIndex[],
    page = 1,
    limit = 10,
  ): Promise<SearchResponsePayload | null> {
    return this.executeVendorSearch(
      vendorId,
      this.filterIndexes(types, VENDOR_INDEXES),
      search,
      page,
      limit,
    );
  }

  async autocompleteVendor(
    vendorId: string,
    search: string,
    types?: SearchIndex[],
    limit = 10,
  ): Promise<SearchResultItem[] | null> {
    const normalizedSearch = this.normalizeSearch(search);

    if (!normalizedSearch) {
      return null;
    }

    const indexes = this.filterIndexes(types, VENDOR_INDEXES);

    const safeLimit = this.normalizeLimit(limit);

    const cacheKey = this.buildCacheKey(
      `vendor:${vendorId}:autocomplete`,
      normalizedSearch,
      indexes.join(','),
      safeLimit,
    );

    const cached = await this.getCache<SearchResultItem[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.executeVendorSearch(
      vendorId,
      indexes,
      normalizedSearch,
      1,
      safeLimit,
    );

    if (!result) {
      return null;
    }

    await this.setCache(cacheKey, result.results);

    return result.results;
  }

  // ---------------------------------------------------------------------------
  // GENERIC SEARCH
  // ---------------------------------------------------------------------------

  private async executeSearch(
    indexes: SearchIndex[],
    search: string,
    page: number,
    limit: number,
  ): Promise<SearchResponsePayload | null> {
    const normalizedSearch = this.normalizeSearch(search);

    if (normalizedSearch.length < MIN_SEARCH_LENGTH) {
      return null;
    }

    const safePage = this.normalizePage(page);

    const safeLimit = this.normalizeLimit(limit);

    const sortedIndexes = [...indexes].sort();

    const cacheKey = this.buildCacheKey(
      'global',
      normalizedSearch,
      sortedIndexes.join(','),
      safePage,
      safeLimit,
    );

    const cached = await this.getCache<SearchResponsePayload>(cacheKey);

    if (cached) {
      return cached;
    }

    /*
     * Fetch enough records from each index to fill the requested global page.
     *
     * This is intentionally bounded by MAX_LIMIT so a request cannot cause
     * an unbounded database query.
     */
    const searchLimit = Math.min(safePage * safeLimit, MAX_LIMIT);

    const results = await Promise.all(
      sortedIndexes.map((index) =>
        this.searchIndex(index, normalizedSearch, searchLimit),
      ),
    );

    /*
     * The previous implementation concatenated each index and then sliced.
     * That makes the first index dominate the global result.
     *
     * Sorting all returned hits by relevance gives a more predictable
     * global search experience.
     */
    const allItems = results
      .flatMap((entry) => entry.items)
      .sort((a, b) => b.score - a.score);

    const total = results.reduce((sum, entry) => sum + entry.total, 0);

    const start = (safePage - 1) * safeLimit;

    const items = allItems.slice(start, start + safeLimit);

    const response = {
      results: items,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };

    await this.setCache(cacheKey, response);

    return response;
  }

  private async executeVendorSearch(
    vendorId: string,
    indexes: SearchIndex[],
    search: string,
    page: number,
    limit: number,
  ): Promise<SearchResponsePayload | null> {
    const normalizedSearch = this.normalizeSearch(search);

    if (normalizedSearch.length < MIN_SEARCH_LENGTH) {
      return null;
    }

    const safePage = this.normalizePage(page);

    const safeLimit = this.normalizeLimit(limit);

    const sortedIndexes = [...indexes].sort();

    const cacheKey = this.buildCacheKey(
      `vendor:${vendorId}`,
      normalizedSearch,
      sortedIndexes.join(','),
      safePage,
      safeLimit,
    );

    const cached = await this.getCache<SearchResponsePayload>(cacheKey);

    if (cached) {
      return cached;
    }

    const searchLimit = Math.min(safePage * safeLimit, MAX_LIMIT);

    const results = await Promise.all(
      sortedIndexes.map((index) =>
        this.searchVendorIndex(vendorId, index, normalizedSearch, searchLimit),
      ),
    );

    const allItems = results
      .flatMap((entry) => entry.items)
      .sort((a, b) => b.score - a.score);

    const total = results.reduce((sum, entry) => sum + entry.total, 0);

    const start = (safePage - 1) * safeLimit;

    const items = allItems.slice(start, start + safeLimit);

    const response = {
      results: items,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };

    await this.setCache(cacheKey, response);

    return response;
  }

  // ---------------------------------------------------------------------------
  // INDEX DISPATCH
  // ---------------------------------------------------------------------------

  private async searchIndex(
    index: SearchIndex,
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    switch (index) {
      case 'products':
        return this.searchProductsDb(search, limit);

      case 'vendors':
        return this.searchVendorsDb(search, limit);

      case 'categories':
        return this.searchCategoriesDb(search, limit);

      case 'users':
        return this.searchUsersDb(search, limit);

      case 'orders':
        return this.searchOrdersDb(search, limit);

      case 'discount_codes':
        return this.searchDiscountCodesDb(search, limit);
    }
  }

  private async searchVendorIndex(
    vendorId: string,
    index: SearchIndex,
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    switch (index) {
      case 'products':
        return this.searchVendorProductsDb(vendorId, search, limit);

      case 'orders':
        return this.searchVendorOrdersDb(vendorId, search, limit);

      case 'discount_codes':
        return this.searchVendorDiscountCodesDb(vendorId, search, limit);

      default:
        return {
          items: [],
          total: 0,
        };
    }
  }

  // ---------------------------------------------------------------------------
  // PRODUCTS
  // ---------------------------------------------------------------------------

  private async searchProductsDb(
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<ProductRow[]>`
        SELECT
          id,
          name,
          sku,
          (
            CASE
              WHEN name ILIKE ${pattern}
                THEN 2.0 + similarity(name, ${search})
              WHEN sku ILIKE ${pattern}
                THEN 1.5 + similarity(sku, ${search})
              ELSE similarity(name, ${search})
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM products
        WHERE
          "isActive" = true
          AND "isDeleted" = false
          AND (
            name ILIKE ${pattern}
            OR sku ILIKE ${pattern}
            OR similarity(name, ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(sku, ${search}) > ${SIMILARITY_THRESHOLD}
          )
        ORDER BY score DESC, "createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((product) => ({
        id: product.id,
        index: 'products',
        type: 'product',
        title: product.name,
        subtitle: product.sku,
        score: Number(product.score),
        payload: {
          id: product.id,
          name: product.name,
          sku: product.sku,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // VENDORS
  // ---------------------------------------------------------------------------

  private async searchVendorsDb(
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<VendorRow[]>`
        SELECT
          id,
          "storeName",
          "storeDescription",
          email,
          "firstName",
          "lastName",
          (
            CASE
              WHEN "storeName" ILIKE ${pattern}
                THEN 3.0 + similarity("storeName", ${search})
              WHEN "firstName" ILIKE ${pattern}
                OR "lastName" ILIKE ${pattern}
                THEN 2.0 + similarity(
                  COALESCE("firstName", '') || ' ' ||
                  COALESCE("lastName", ''),
                  ${search}
                )
              WHEN "storeDescription" ILIKE ${pattern}
                THEN 1.0 + similarity(
                  COALESCE("storeDescription", ''),
                  ${search}
                )
              ELSE similarity(
                COALESCE("storeName", ''),
                ${search}
              )
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM vendors
        WHERE
          "isActive" = true
          AND "isApproved" = true
          AND (
            "storeName" ILIKE ${pattern}
            OR COALESCE("storeDescription", '') ILIKE ${pattern}
            OR email ILIKE ${pattern}
            OR "firstName" ILIKE ${pattern}
            OR "lastName" ILIKE ${pattern}
            OR similarity("storeName", ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(COALESCE("storeDescription", ''), ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(COALESCE("firstName", ''), ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(COALESCE("lastName", ''), ${search}) > ${SIMILARITY_THRESHOLD}
          )
        ORDER BY score DESC, "createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((vendor) => ({
        id: vendor.id,
        index: 'vendors',
        type: 'vendor',
        title: vendor.storeName,
        subtitle: vendor.storeDescription ?? undefined,
        score: Number(vendor.score),
        payload: {
          id: vendor.id,
          storeName: vendor.storeName,
          storeDescription: vendor.storeDescription,
          email: vendor.email,
          firstName: vendor.firstName,
          lastName: vendor.lastName,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // CATEGORIES
  // ---------------------------------------------------------------------------

  private async searchCategoriesDb(
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<CategoryRow[]>`
        SELECT
          id,
          name,
          description,
          slug,
          (
            CASE
              WHEN name ILIKE ${pattern}
                THEN 2.0 + similarity(name, ${search})
              WHEN description ILIKE ${pattern}
                THEN 1.0 + similarity(
                  COALESCE(description, ''),
                  ${search}
                )
              ELSE similarity(name, ${search})
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM categories
        WHERE
          "isActive" = true
          AND (
            name ILIKE ${pattern}
            OR COALESCE(description, '') ILIKE ${pattern}
            OR slug ILIKE ${pattern}
            OR similarity(name, ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(COALESCE(description, ''), ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(slug, ${search}) > ${SIMILARITY_THRESHOLD}
          )
        ORDER BY score DESC, "createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((category) => ({
        id: category.id,
        index: 'categories',
        type: 'category',
        title: category.name,
        subtitle: category.description ?? undefined,
        score: Number(category.score),
        payload: {
          id: category.id,
          name: category.name,
          description: category.description,
          slug: category.slug,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // USERS
  // ---------------------------------------------------------------------------

  private async searchUsersDb(
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<UserRow[]>`
        SELECT
          u.id,
          u.email,
          u."firstName",
          u."lastName",
          rc.code AS "referralCode",
          (
            CASE
              WHEN u.email ILIKE ${pattern}
                THEN 3.0 + similarity(u.email, ${search})
              WHEN u."firstName" ILIKE ${pattern}
                OR u."lastName" ILIKE ${pattern}
                THEN 2.0 + similarity(
                  COALESCE(u."firstName", '') || ' ' ||
                  COALESCE(u."lastName", ''),
                  ${search}
                )
              WHEN rc.code ILIKE ${pattern}
                THEN 2.5 + similarity(rc.code, ${search})
              ELSE similarity(u.email, ${search})
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM users u
        LEFT JOIN referral_codes rc
          ON rc."userId" = u.id
        WHERE
          u.email ILIKE ${pattern}
          OR u."firstName" ILIKE ${pattern}
          OR u."lastName" ILIKE ${pattern}
          OR rc.code ILIKE ${pattern}
          OR similarity(u.email, ${search}) > ${SIMILARITY_THRESHOLD}
          OR similarity(COALESCE(u."firstName", ''), ${search}) > ${SIMILARITY_THRESHOLD}
          OR similarity(COALESCE(u."lastName", ''), ${search}) > ${SIMILARITY_THRESHOLD}
          OR similarity(COALESCE(rc.code, ''), ${search}) > ${SIMILARITY_THRESHOLD}
        ORDER BY score DESC, u."createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((user) => ({
        id: user.id,
        index: 'users',
        type: 'user',
        title: user.email,
        subtitle: [user.firstName, user.lastName].filter(Boolean).join(' '),
        score: Number(user.score),
        payload: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          referralCode: user.referralCode
            ? {
                code: user.referralCode,
              }
            : null,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // ORDERS
  // ---------------------------------------------------------------------------

  private async searchOrdersDb(
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<OrderRow[]>`
        SELECT
          o.id,
          o."orderNumber",
          o.status,
          o."discountCode",
          o."referralCode",
          o."shippingAddress",
          u.email AS "userEmail",
          (
            CASE
              WHEN o."orderNumber" ILIKE ${pattern}
                THEN 3.0 + similarity(
                  o."orderNumber",
                  ${search}
                )
              WHEN u.email ILIKE ${pattern}
                THEN 2.0 + similarity(
                  u.email,
                  ${search}
                )
              WHEN o."discountCode" ILIKE ${pattern}
                THEN 2.5 + similarity(
                  o."discountCode",
                  ${search}
                )
              WHEN o."referralCode" ILIKE ${pattern}
                THEN 2.5 + similarity(
                  o."referralCode",
                  ${search}
                )
              ELSE similarity(
                COALESCE(
                  o."shippingAddress",
                  ''
                ),
                ${search}
              )
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM orders o
        LEFT JOIN users u
          ON u.id = o."userId"
        WHERE
          o."orderNumber" ILIKE ${pattern}
          OR o."discountCode" ILIKE ${pattern}
          OR o."referralCode" ILIKE ${pattern}
          OR o."shippingAddress" ILIKE ${pattern}
          OR u.email ILIKE ${pattern}
          OR similarity(o."orderNumber", ${search}) > ${SIMILARITY_THRESHOLD}
          OR similarity(COALESCE(o."shippingAddress", ''), ${search}) > ${SIMILARITY_THRESHOLD}
          OR similarity(u.email, ${search}) > ${SIMILARITY_THRESHOLD}
        ORDER BY score DESC, o."createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((order) => ({
        id: order.id,
        index: 'orders',
        type: 'order',
        title: order.orderNumber,
        subtitle: [order.userEmail, order.status, order.shippingAddress]
          .filter(Boolean)
          .join(' • '),
        score: Number(order.score),
        payload: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          discountCode: order.discountCode,
          referralCode: order.referralCode,
          shippingAddress: order.shippingAddress,
          user: order.userEmail
            ? {
                email: order.userEmail,
              }
            : null,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // DISCOUNT CODES
  // ---------------------------------------------------------------------------

  private async searchDiscountCodesDb(
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<DiscountCodeRow[]>`
        SELECT
          id,
          code,
          description,
          (
            CASE
              WHEN code ILIKE ${pattern}
                THEN 2.0 + similarity(
                  code,
                  ${search}
                )
              WHEN description ILIKE ${pattern}
                THEN 1.0 + similarity(
                  COALESCE(description, ''),
                  ${search}
                )
              ELSE similarity(
                code,
                ${search}
              )
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM discount_codes
        WHERE
          code ILIKE ${pattern}
          OR COALESCE(description, '') ILIKE ${pattern}
          OR similarity(code, ${search}) > ${SIMILARITY_THRESHOLD}
          OR similarity(
            COALESCE(description, ''),
            ${search}
          ) > ${SIMILARITY_THRESHOLD}
        ORDER BY score DESC, "createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((discountCode) => ({
        id: discountCode.id,
        index: 'discount_codes',
        type: 'discount_code',
        title: discountCode.code,
        subtitle: discountCode.description ?? undefined,
        score: Number(discountCode.score),
        payload: {
          id: discountCode.id,
          code: discountCode.code,
          description: discountCode.description,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // VENDOR PRODUCTS
  // ---------------------------------------------------------------------------

  private async searchVendorProductsDb(
    vendorId: string,
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<ProductRow[]>`
        SELECT
          id,
          name,
          sku,
          (
            CASE
              WHEN name ILIKE ${pattern}
                THEN 2.0 + similarity(name, ${search})
              WHEN sku ILIKE ${pattern}
                THEN 1.5 + similarity(sku, ${search})
              WHEN description ILIKE ${pattern}
                THEN 1.0 + similarity(
                  COALESCE(description, ''),
                  ${search}
                )
              ELSE similarity(
                name,
                ${search}
              )
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM products
        WHERE
          "vendorId" = ${vendorId}
          AND "isDeleted" = false
          AND (
            name ILIKE ${pattern}
            OR sku ILIKE ${pattern}
            OR COALESCE(description, '') ILIKE ${pattern}
            OR similarity(name, ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(sku, ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(COALESCE(description, ''), ${search}) > ${SIMILARITY_THRESHOLD}
          )
        ORDER BY score DESC, "createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((product) => ({
        id: product.id,
        index: 'products',
        type: 'product',
        title: product.name,
        subtitle: product.sku,
        score: Number(product.score),
        payload: {
          id: product.id,
          name: product.name,
          sku: product.sku,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // VENDOR ORDERS
  // ---------------------------------------------------------------------------

  private async searchVendorOrdersDb(
    vendorId: string,
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<OrderRow[]>`
        WITH unique_orders AS (
          SELECT DISTINCT
            o.id,
            o."orderNumber",
            o.status,
            o."discountCode",
            o."referralCode",
            o."shippingAddress",
            u.email AS "userEmail",
            o."createdAt"
          FROM orders o
          LEFT JOIN users u
            ON u.id = o."userId"
          INNER JOIN order_items oi
            ON oi."orderId" = o.id
          WHERE
            oi."vendorId" = ${vendorId}
            AND (
              o."orderNumber" ILIKE ${pattern}
              OR o."discountCode" ILIKE ${pattern}
              OR o."referralCode" ILIKE ${pattern}
              OR o."shippingAddress" ILIKE ${pattern}
              OR u.email ILIKE ${pattern}
              OR similarity(o."orderNumber", ${search}) > ${SIMILARITY_THRESHOLD}
              OR similarity(COALESCE(o."shippingAddress", ''), ${search}) > ${SIMILARITY_THRESHOLD}
              OR similarity(u.email, ${search}) > ${SIMILARITY_THRESHOLD}
            )
        )
        SELECT
          id,
          "orderNumber",
          status,
          "discountCode",
          "referralCode",
          "shippingAddress",
          "userEmail",
          (
            CASE
              WHEN "orderNumber" ILIKE ${pattern}
                THEN 3.0 + similarity(
                  "orderNumber",
                  ${search}
                )
              WHEN "userEmail" ILIKE ${pattern}
                THEN 2.0 + similarity(
                  "userEmail",
                  ${search}
                )
              ELSE similarity(
                COALESCE(
                  "shippingAddress",
                  ''
                ),
                ${search}
              )
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM unique_orders
        ORDER BY score DESC, "createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((order) => ({
        id: order.id,
        index: 'orders',
        type: 'order',
        title: order.orderNumber,
        subtitle: [order.userEmail, order.status, order.shippingAddress]
          .filter(Boolean)
          .join(' • '),
        score: Number(order.score),
        payload: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          discountCode: order.discountCode,
          referralCode: order.referralCode,
          shippingAddress: order.shippingAddress,
          user: order.userEmail
            ? {
                email: order.userEmail,
              }
            : null,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // VENDOR DISCOUNT CODES
  // ---------------------------------------------------------------------------

  private async searchVendorDiscountCodesDb(
    vendorId: string,
    search: string,
    limit: number,
  ): Promise<{
    items: SearchResultItem[];
    total: number;
  }> {
    const pattern = `%${search}%`;

    const rows = await this.prisma.$queryRaw<DiscountCodeRow[]>`
        SELECT
          id,
          code,
          description,
          (
            CASE
              WHEN code ILIKE ${pattern}
                THEN 2.0 + similarity(
                  code,
                  ${search}
                )
              WHEN description ILIKE ${pattern}
                THEN 1.0 + similarity(
                  COALESCE(description, ''),
                  ${search}
                )
              ELSE similarity(
                code,
                ${search}
              )
            END
          ) AS score,
          COUNT(*) OVER()::integer AS total_count
        FROM discount_codes
        WHERE
          "vendorId" = ${vendorId}
          AND (
            code ILIKE ${pattern}
            OR COALESCE(description, '') ILIKE ${pattern}
            OR similarity(code, ${search}) > ${SIMILARITY_THRESHOLD}
            OR similarity(
              COALESCE(description, ''),
              ${search}
            ) > ${SIMILARITY_THRESHOLD}
          )
        ORDER BY score DESC, "createdAt" DESC
        LIMIT ${limit};
      `;

    return {
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,

      items: rows.map((discountCode) => ({
        id: discountCode.id,
        index: 'discount_codes',
        type: 'discount_code',
        title: discountCode.code,
        subtitle: discountCode.description ?? undefined,
        score: Number(discountCode.score),
        payload: {
          id: discountCode.id,
          code: discountCode.code,
          description: discountCode.description,
        },
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private filterIndexes(
    requested: SearchIndex[] | undefined,
    allowed: SearchIndex[],
  ): SearchIndex[] {
    if (!requested?.length) {
      return [...allowed];
    }

    return requested.filter((index) => allowed.includes(index));
  }

  private normalizeSearch(search: string): string {
    return search.trim().replace(/\s+/g, ' ');
  }

  private normalizePage(page: number): number {
    if (!Number.isFinite(page)) {
      return 1;
    }

    return Math.max(1, Math.floor(page));
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit)) {
      return 10;
    }

    return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  }

  private buildCacheKey(
    namespace: string,
    ...parts: Array<string | number>
  ): string {
    return [
      'search',
      namespace,
      ...parts.map((part) => encodeURIComponent(String(part))),
    ].join(':');
  }

  private async getCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as T;
    } catch (error) {
      /*
       * Redis is a performance layer.
       *
       * A Redis failure should not make database search unavailable.
       */
      this.logger.warn(`Search cache read failed for key ${key}`, error);

      return null;
    }
  }

  private async setCache<T>(key: string, value: T): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
      /*
       * Search results remain correct even if caching fails.
       */
      this.logger.warn(`Search cache write failed for key ${key}`, error);
    }
  }
}
