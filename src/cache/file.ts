import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Cache, CacheEntry } from "../types";

export type FileCacheOptions = {
  /** Absolute path to the cache file. Parent directories are created on first write. */
  path: string;
};

type PersistedShape = Record<string, CacheEntry>;

/**
 * File-backed cache adapter.
 *
 * SECURITY WARNING: persists secret values to disk as unencrypted JSON. Use
 * only in trusted environments (developer workstations, isolated containers
 * with no shared filesystem). Prefer `memoryCache()` for production workloads.
 * If cold-start cost is a concern, consider a Redis-backed adapter over a
 * file-backed one.
 */
export function fileCache(options: FileCacheOptions): Cache {
  const { path } = options;
  const store = new Map<string, CacheEntry>();
  let hydrated = false;
  let flushQueue: Promise<unknown> = Promise.resolve();

  function hydrate(): void {
    if (hydrated) return;
    hydrated = true;
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        // Permission error or other — start fresh rather than fail.
      }
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PersistedShape;
      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        if (entry && typeof entry === "object" && entry.expiresAt > now) {
          store.set(key, entry);
        }
      }
    } catch {
      // Corrupted file — start fresh.
    }
  }

  function scheduleFlush(): void {
    flushQueue = flushQueue
      .catch(() => undefined)
      .then(async () => {
        const payload: PersistedShape = {};
        const now = Date.now();
        for (const [key, entry] of store) {
          if (entry.expiresAt > now) payload[key] = entry;
        }
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(payload), "utf8");
      });
  }

  return {
    get(key) {
      hydrate();
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        scheduleFlush();
        return undefined;
      }
      return entry;
    },
    set(key, entry) {
      hydrate();
      store.set(key, entry);
      scheduleFlush();
    },
    delete(key) {
      hydrate();
      store.delete(key);
      scheduleFlush();
    },
    clear() {
      hydrate();
      store.clear();
      scheduleFlush();
    },
    entries() {
      hydrate();
      return [...store.entries()];
    },
  };
}
