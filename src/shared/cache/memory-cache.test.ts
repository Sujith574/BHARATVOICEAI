import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryCache } from "./memory-cache";

describe("MemoryCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should store and retrieve cached values", () => {
    const cache = new MemoryCache();
    cache.set("key1", "val1");
    expect(cache.get("key1")).toBe("val1");
  });

  it("should evict oldest value when size limit is reached", () => {
    const cache = new MemoryCache(0, 2); // Max size of 2
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size()).toBe(2);

    cache.set("c", 3); // Should evict oldest key "a"
    expect(cache.size()).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("should respect TTL value and return undefined after expiration", () => {
    const cache = new MemoryCache(100); // Default TTL of 100ms
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);

    // Fast-forward 150ms
    vi.advanceTimersByTime(150);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("should respect custom TTL passed in set method", () => {
    const cache = new MemoryCache(500); // Default 500ms
    cache.set("a", 1, 100); // Custom 100ms TTL

    expect(cache.get("a")).toBe(1);

    // Fast-forward 150ms
    vi.advanceTimersByTime(150);
    expect(cache.get("a")).toBeUndefined();
  });

  it("should delete key and clear all values correctly", () => {
    const cache = new MemoryCache();
    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("b")).toBeUndefined();
  });
});
