import { Inject, Injectable, Logger } from '@nestjs/common';

import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

export enum CacheKeys {
  // Products
  PRODUCT_DETAILS = 'product:details:',
  PRODUCT_CARD = 'product:card:',
  PRODUCT_VARIANTS = 'product:variants:',
  PRODUCT_SLUG = 'product:slug:',

  // Variants
  VARIANT_DETAILS = 'variant:id:',
  VARIANT_PRODUCT = 'variant:product:',

  // Categories
  CATEGORY_TREE = 'category:tree',

  // Vendors
  VENDOR_PROFILE = 'vendor:profile:',
  VENDOR_STORE = 'vendor:store:',

  // Orders
  ORDER_SUMMARY = 'order:summary:',
  ORDER_STATS = 'order:stats:',

  // Promotions
  DISCOUNT_CODE = 'discount:code:',
  PROMOTION_LIST = 'promotion:list',

  // Users
  USER_PROFILE = 'user:profile:',
  USER_STATS = 'user:stats:',

  // System
  FEATURE_FLAGS = 'feature:flags',
  CONFIG_CACHE = 'config:cache',
}

export interface CacheOptions {
  /**
   * TTL in seconds.
   */
  ttl?: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  private readonly DEFAULT_TTL = 3600;
  // Redis is the shared source of truth. A short process-local L1 cache keeps
  // hot public reads from paying a network round trip on every request.
  private readonly LOCAL_CACHE_TTL_MS = 5_000;
  private readonly LOCAL_CACHE_MAX_ENTRIES = 256;
  private readonly LOCAL_CACHE_MAX_ENTRY_BYTES = 512 * 1024;
  private readonly LOCAL_CACHE_MAX_BYTES = 16 * 1024 * 1024;
  private localCacheBytes = 0;
  private readonly localCache = new Map<
    string,
    { serialized: string; expiresAt: number }
  >();
  // Coalesce concurrent cache misses so one cold database read serves all
  // requests for the same public resource.
  private readonly inFlight = new Map<
    string,
    { generation: number; runId: symbol; promise: Promise<unknown> }
  >();
  private readonly generations = new Map<string, number>();

  private generationFor(key: string): number {
    return this.generations.get(key) ?? 0;
  }

  private invalidateInFlight(key: string): void {
    this.generations.set(key, this.generationFor(key) + 1);
  }

  private computeOnce<T>(
    key: string,
    ttlSeconds: number,
    computeFn: () => Promise<T>,
  ): Promise<T> {
    const generation = this.generationFor(key);
    const existing = this.inFlight.get(key);
    if (existing?.generation === generation) {
      return existing.promise as Promise<T>;
    }

    const runId = Symbol();
    const computePromise = (async () => {
      try {
        const value = await computeFn();
        // A mutation may invalidate the cache while the cold read is running.
        // Do not allow that older read to restore stale data afterward.
        if (this.generationFor(key) === generation) {
          await this.write(key, value, ttlSeconds);
        }
        return value;
      } finally {
        if (this.inFlight.get(key)?.runId === runId) {
          this.inFlight.delete(key);
        }
      }
    })();

    this.inFlight.set(key, { generation, runId, promise: computePromise });
    return computePromise;
  }

  private canUseLocalCache(key: string): boolean {
    return (
      key.startsWith('category:') ||
      key.startsWith('product:') ||
      key.startsWith('products:public:') ||
      key.startsWith('vendor:store:') ||
      key.startsWith('vendors:public:')
    );
  }

  private rememberLocally(key: string, serialized: string): void {
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (
      !this.canUseLocalCache(key) ||
      bytes > this.LOCAL_CACHE_MAX_ENTRY_BYTES
    ) {
      return;
    }

    // Refresh insertion order for LRU eviction and keep memory bounded.
    this.forgetLocally(key);
    this.localCache.set(key, {
      serialized,
      expiresAt: Date.now() + this.LOCAL_CACHE_TTL_MS,
    });
    this.localCacheBytes += bytes;
    while (
      this.localCache.size > this.LOCAL_CACHE_MAX_ENTRIES ||
      this.localCacheBytes > this.LOCAL_CACHE_MAX_BYTES
    ) {
      const oldestKey = this.localCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.forgetLocally(oldestKey);
    }
  }

  private forgetLocally(key: string): void {
    const entry = this.localCache.get(key);
    if (!entry) return;
    this.localCache.delete(key);
    this.localCacheBytes -= Buffer.byteLength(entry.serialized, 'utf8');
  }

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /**
   * Reads a short-lived local copy first, then falls through to Redis.
   *
   * Cache failures intentionally fail open:
   * the database remains the source of truth.
   */
  async get<T>(key: string): Promise<T | undefined> {
    const local = this.localCache.get(key);
    if (local) {
      if (local.expiresAt > Date.now()) {
        this.localCache.delete(key);
        this.localCache.set(key, local);
        try {
          return JSON.parse(local.serialized) as T;
        } catch {
          this.forgetLocally(key);
        }
      } else {
        this.forgetLocally(key);
      }
    }

    try {
      const value = await this.redis.get(key);

      if (value === null) {
        return undefined;
      }

      this.rememberLocally(key, value);
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn(
        `Redis GET failed for "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return undefined;
    }
  }

  /**
   * Stores JSON-serializable data in Redis.
   */
  async set<T>(
    key: string,
    value: T,
    optionsOrTtl: CacheOptions | number = {},
  ): Promise<void> {
    const ttl =
      typeof optionsOrTtl === 'number'
        ? optionsOrTtl
        : (optionsOrTtl.ttl ?? this.DEFAULT_TTL);

    this.invalidateInFlight(key);
    await this.write(key, value, ttl);
  }

  private async write<T>(key: string, value: T, ttl: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return;
    this.rememberLocally(key, serialized);

    try {
      await this.redis.set(key, serialized, 'EX', ttl);
    } catch (error) {
      this.logger.warn(
        `Redis SET failed for "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Deletes a specific cache entry.
   */
  async del(key: string): Promise<void> {
    this.invalidateInFlight(key);
    this.forgetLocally(key);
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(
        `Redis DEL failed for "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Deletes keys matching a glob pattern.
   *
   * SCAN is used instead of KEYS so we do not block Redis
   * while scanning a large production dataset.
   */
  async delByPattern(pattern: string): Promise<void> {
    const patternRegex = new RegExp(
      `^${pattern
        .split('*')
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    );
    const knownKeys = new Set([
      ...this.localCache.keys(),
      ...this.inFlight.keys(),
    ]);
    for (const key of knownKeys) {
      if (patternRegex.test(key)) {
        this.invalidateInFlight(key);
        this.forgetLocally(key);
      }
    }

    try {
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );

        cursor = nextCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        `Redis pattern invalidation failed for "${pattern}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Clears the entire Redis database.
   *
   * Keep this for administrative/maintenance operations only.
   */
  async clear(): Promise<void> {
    for (const key of this.inFlight.keys()) this.invalidateInFlight(key);
    this.localCache.clear();
    this.localCacheBytes = 0;
    try {
      await this.redis.flushdb();
    } catch (error) {
      this.logger.error(
        `Redis FLUSHDB failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Cache-aside pattern.
   */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    computeFn: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    return this.computeOnce(key, ttlSeconds, computeFn);
  }

  /**
   * Legacy cache-aside API.
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    return this.computeOnce(key, options.ttl ?? this.DEFAULT_TTL, computeFn);
  }

  /**
   * Batch read.
   */
  async mget<T = unknown>(
    keys: string[],
  ): Promise<Record<string, T | undefined>> {
    if (keys.length === 0) {
      return {};
    }

    try {
      const values = await this.redis.mget(...keys);

      return Object.fromEntries(
        keys.map((key, index) => [
          key,
          values[index] === null ? undefined : (JSON.parse(values[index]) as T),
        ]),
      );
    } catch (error) {
      this.logger.warn(
        `Redis MGET failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {};
    }
  }

  /**
   * Batch write.
   */
  async mset(
    values: Record<string, unknown>,
    options: CacheOptions = {},
  ): Promise<void> {
    const entries = Object.entries(values);

    if (entries.length === 0) {
      return;
    }

    const ttl = options.ttl ?? this.DEFAULT_TTL;

    try {
      const pipeline = this.redis.pipeline();

      for (const [key, value] of entries) {
        this.invalidateInFlight(key);
        pipeline.set(key, JSON.stringify(value), 'EX', ttl);
      }

      await pipeline.exec();
    } catch (error) {
      this.logger.warn(
        `Redis MSET failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Atomic Redis increment.
   */
  async increment(key: string, amount = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, amount);
    } catch (error) {
      this.logger.warn(
        `Redis INCRBY failed for "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return 0;
    }
  }

  /**
   * Atomic Redis decrement.
   */
  async decrement(key: string, amount = 1): Promise<number> {
    return this.increment(key, -amount);
  }

  /**
   * Set a value with millisecond expiry.
   */
  async setWithExpiry(
    key: string,
    value: unknown,
    expiresInMs: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'PX', expiresInMs);
    } catch (error) {
      this.logger.warn(
        `Redis PSETEX failed for "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Checks whether Redis is reachable.
   */
  isAvailable(): boolean {
    return this.redis.status === 'ready';
  }

  /**
   * Returns basic Redis state.
   */
  async getStats(): Promise<{
    available: boolean;
    keys: number;
  }> {
    try {
      const keys = await this.redis.dbsize();

      return {
        available: this.isAvailable(),
        keys,
      };
    } catch {
      return {
        available: false,
        keys: 0,
      };
    }
  }

  /**
   * Builds consistent namespaced cache keys.
   */
  buildKey(prefix: string, ...parts: string[]): string {
    return [prefix, ...parts].filter((part) => part.length > 0).join(':');
  }

  /**
   * Product detail helpers.
   */
  async cacheProductDetails(productId: string, data: unknown): Promise<void> {
    await this.set(this.buildKey(CacheKeys.PRODUCT_DETAILS, productId), data, {
      ttl: 3600,
    });
  }

  async getProductDetailsFromCache(productId: string): Promise<unknown> {
    return this.get(this.buildKey(CacheKeys.PRODUCT_DETAILS, productId));
  }

  async invalidateProductCache(productId: string): Promise<void> {
    await Promise.all([
      this.del(this.buildKey(CacheKeys.PRODUCT_DETAILS, productId)),
      this.del(this.buildKey(CacheKeys.PRODUCT_CARD, productId)),
    ]);
  }

  /**
   * Vendor cache helpers.
   */
  async cacheVendorProfile(vendorId: string, data: unknown): Promise<void> {
    await this.set(this.buildKey(CacheKeys.VENDOR_PROFILE, vendorId), data, {
      ttl: 1800,
    });
  }

  async getVendorProfileFromCache(vendorId: string): Promise<unknown> {
    return this.get(this.buildKey(CacheKeys.VENDOR_PROFILE, vendorId));
  }

  async invalidateVendorCache(vendorId: string): Promise<void> {
    await Promise.all([
      this.del(this.buildKey(CacheKeys.VENDOR_PROFILE, vendorId)),
      this.del(this.buildKey(CacheKeys.VENDOR_STORE, vendorId)),
    ]);
  }

  /**
   * Category cache helpers.
   */
  async cacheCategoryTree(data: unknown): Promise<void> {
    await this.set(CacheKeys.CATEGORY_TREE, data, { ttl: 7200 });
  }

  async getCategoryTreeFromCache(): Promise<unknown> {
    return this.get(CacheKeys.CATEGORY_TREE);
  }

  async invalidateCategoryCache(): Promise<void> {
    await this.del(CacheKeys.CATEGORY_TREE);
  }

  /**
   * Discount-code cache helpers.
   */
  async cacheDiscountCode(code: string, data: unknown): Promise<void> {
    await this.set(this.buildKey(CacheKeys.DISCOUNT_CODE, code), data, {
      ttl: 300,
    });
  }

  async getDiscountCodeFromCache(code: string): Promise<unknown> {
    return this.get(this.buildKey(CacheKeys.DISCOUNT_CODE, code));
  }

  async invalidateDiscountCodeCache(code: string): Promise<void> {
    await this.del(this.buildKey(CacheKeys.DISCOUNT_CODE, code));
  }

  /**
   * Variant-specific invalidation.
   */
  async invalidateVariantCache(
    variantId: string,
    productId: string,
  ): Promise<void> {
    await Promise.all([
      this.del(this.buildKey(CacheKeys.VARIANT_DETAILS, variantId)),

      this.del(this.buildKey(CacheKeys.VARIANT_PRODUCT, productId)),

      this.del(this.buildKey(CacheKeys.PRODUCT_DETAILS, productId)),

      this.del(this.buildKey(CacheKeys.PRODUCT_CARD, productId)),

      // Public product lists may contain stock/variant information.
      this.delByPattern('product:list:*'),
    ]);
  }
}
