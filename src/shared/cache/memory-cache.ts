interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  public constructor(
    private readonly defaultTtlMs: number = 0, // 0 means no TTL (infinite)
    private readonly maxSize: number = 1000
  ) {}

  public get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs?: number): void {
    // If the cache is full and we're inserting a new key, evict the oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : undefined;

    const entry: CacheEntry<unknown> = { value };
    if (expiresAt !== undefined) {
      entry.expiresAt = expiresAt;
    }

    this.cache.set(key, entry);
  }

  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }
}
