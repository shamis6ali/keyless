import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryCache } from "../src/cache/memory";

describe("memoryCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores and retrieves values before expiry", () => {
    const cache = memoryCache();
    const now = Date.now();
    cache.set("a", { value: "v", cachedAt: now, expiresAt: now + 1000 });
    expect(cache.get("a")?.value).toBe("v");
  });

  it("returns undefined after expiry and evicts", () => {
    const cache = memoryCache();
    const now = Date.now();
    cache.set("a", { value: "v", cachedAt: now, expiresAt: now + 1000 });
    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.entries()).toHaveLength(0);
  });

  it("deletes individual keys", () => {
    const cache = memoryCache();
    const now = Date.now();
    cache.set("a", { value: 1, cachedAt: now, expiresAt: now + 1000 });
    cache.set("b", { value: 2, cachedAt: now, expiresAt: now + 1000 });
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")?.value).toBe(2);
  });

  it("clears everything", () => {
    const cache = memoryCache();
    const now = Date.now();
    cache.set("a", { value: 1, cachedAt: now, expiresAt: now + 1000 });
    cache.set("b", { value: 2, cachedAt: now, expiresAt: now + 1000 });
    cache.clear();
    expect(cache.entries()).toHaveLength(0);
  });
});
