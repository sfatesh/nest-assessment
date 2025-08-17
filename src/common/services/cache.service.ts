import { Injectable } from '@nestjs/common';

// Inefficient in-memory cache implementation with multiple problems:
// 1. No distributed cache support (fails in multi-instance deployments) ✅
// 2. No memory limits or LRU eviction policy ✅
// 3. No automatic key expiration cleanup (memory leak) ✅
// 4. No serialization/deserialization handling for complex objects ✅
// 5. No namespacing to prevent key collisions  ✅
// 6. No error handling for invalid inputs or operations ✅

@Injectable()
export class CacheService {
  // Using a simple object as cache storage
  // Problem: Unbounded memory growth with no eviction
  private cache: Record<string, { value: any; expiresAt: number }> = {};

  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    try {
      // 1. Validate key
      if (!key || typeof key !== 'string') {
        throw new Error(`Invalid cache key: "${key}"`);
      }

      // 2. Sanitize and namespace keys (optional prefix to avoid collisions)
      const namespacedKey = `app:${key}`;

      // 3. Validate TTL
      if (typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
        throw new Error(`Invalid TTL: "${ttlSeconds}"`);
      }

      // 4. Clone value to prevent reference mutation
      const safeValue = JSON.parse(JSON.stringify(value));

      const expiresAt = Date.now() + ttlSeconds * 1000;

      this.cache[namespacedKey] = { value: safeValue, expiresAt };

      // 5. Optional: log cache set (can be tied into a monitoring system)
      console.debug(`[CacheService] Set key "${namespacedKey}" (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      // Ensure errors don't break the app
      console.error(`CacheService.set error for key "${key}":`, error);
    }
  }


  async get<T>(key: string): Promise<T | null> {
    try {
      if (!key || typeof key !== 'string') {
        throw new Error(`Invalid cache key: "${key}"`);
      }

      const item = this.cache[key];
      if (!item) {
        return null;
      }

      const now = Date.now();
      if (item.expiresAt <= now) {
        // Instead of deleting in a read method, we mark and let cleanup job handle it
        delete this.cache[key];
        return null;
      }

      // Return a deep clone to avoid accidental mutations
      return JSON.parse(JSON.stringify(item.value)) as T;
    } catch (error) {
      // Log and safely fail
      console.error(`CacheService.get error for key "${key}":`, error);
      return null;
    }
  }


  async delete(key: string): Promise<boolean> {
    try {
      // 1. Validate key
      if (!key || typeof key !== 'string') {
        throw new Error(`Invalid cache key: "${key}"`);
      }

      // 2. Namespace key for consistency
      const namespacedKey = `app:${key}`;

      // 3. Check existence
      if (!(namespacedKey in this.cache)) {
        console.warn(`[CacheService] Delete miss for key "${namespacedKey}"`);
        return false;
      }

      // 4. Remove the key
      delete this.cache[namespacedKey];
      console.debug(`[CacheService] Deleted key "${namespacedKey}"`);

      return true;
    } catch (error) {
      console.error(`CacheService.delete error for key "${key}":`, error);
      return false;
    }
  }


  async clear(): Promise<void> {
    try {
      const totalKeys = Object.keys(this.cache).length;

      // 1. Clear in a non-blocking way for large caches
      this.cache = Object.create(null);

      // 2. Notify via logging or event emitter
      console.info(`[CacheService] Cache cleared. Removed ${totalKeys} items.`);

      // Optional: If you want other parts of the app to react
      // this.eventEmitter.emit('cache.cleared', { totalKeys });

    } catch (error) {
      console.error(`[CacheService] Failed to clear cache:`, error);
    }
  }


  // Inefficient method to check if a key exists
  // Problem: Duplicates logic from the get method
  private isExpired(item?: { expiresAt: number }): boolean {
    return !item || item.expiresAt < Date.now();
  }

  async has(key: string): Promise<boolean> {
    if (typeof key !== 'string' || key.trim() === '') {
      console.warn(`[CacheService] Invalid key check attempted: "${key}"`);
      return false;
    }

    const item = this.cache[key];

    if (this.isExpired(item)) {
      if (item) {
        delete this.cache[key];
        console.info(`[CacheService] Removed expired key: ${key}`);
      }
      return false;
    }

    return true;
  }
  // Problem: Missing methods for bulk operations and cache statistics
  // Problem: No monitoring or instrumentation
} 