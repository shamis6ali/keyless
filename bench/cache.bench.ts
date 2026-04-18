import { bench, describe } from "vitest";
import { memoryCache } from "../src/cache/memory";

describe("memoryCache", () => {
  const cache = memoryCache();
  const now = Date.now();
  for (let i = 0; i < 100; i++) {
    cache.set(`K${i}`, { value: `v${i}`, cachedAt: now, expiresAt: now + 3_600_000 });
  }

  bench("get (hit)", () => {
    cache.get("K42");
  });

  bench("set", () => {
    cache.set("Kset", { value: "v", cachedAt: now, expiresAt: now + 3_600_000 });
  });

  bench("entries (100 items)", () => {
    cache.entries();
  });
});
