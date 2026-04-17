import type { Cache, CacheEntry } from "../types";

export function memoryCache(): Cache {
  const store = new Map<string, CacheEntry>();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry;
    },
    set(key, entry) {
      store.set(key, entry);
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    entries() {
      return [...store.entries()];
    },
  };
}
