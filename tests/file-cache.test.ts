import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileCache } from "../src/cache/file";

async function waitForFlush(): Promise<void> {
  // Queue-microtask gap: scheduleFlush queues writes onto a promise chain;
  // awaiting two microtasks is enough for them to land.
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 20));
}

describe("fileCache", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "keyless-file-cache-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists entries to disk and rehydrates them in a fresh instance", async () => {
    const path = join(dir, "cache.json");
    const a = fileCache({ path });
    const now = Date.now();
    a.set("K", { value: "v", cachedAt: now, expiresAt: now + 60_000 });
    await waitForFlush();

    const raw = await readFile(path, "utf8");
    expect(JSON.parse(raw)).toMatchObject({ K: { value: "v" } });

    // Fresh instance rehydrates synchronously on first access.
    const b = fileCache({ path });
    expect(b.get("K")?.value).toBe("v");
  });

  it("does not rehydrate expired entries", async () => {
    const path = join(dir, "cache.json");
    const now = Date.now();
    const expired = { K: { value: "v", cachedAt: now - 2000, expiresAt: now - 1000 } };
    await writeFile(path, JSON.stringify(expired), "utf8");

    const cache = fileCache({ path });
    expect(cache.get("K")).toBeUndefined();
  });

  it("tolerates a missing file", async () => {
    const cache = fileCache({ path: join(dir, "none.json") });
    expect(cache.get("K")).toBeUndefined();
  });

  it("tolerates a corrupted file", async () => {
    const path = join(dir, "cache.json");
    await writeFile(path, "{{ not valid json", "utf8");
    const cache = fileCache({ path });
    expect(cache.get("K")).toBeUndefined();
  });

  it("clear() empties the cache and the flushed file", async () => {
    const path = join(dir, "cache.json");
    const cache = fileCache({ path });
    const now = Date.now();
    cache.set("K", { value: "v", cachedAt: now, expiresAt: now + 60_000 });
    await waitForFlush();
    cache.clear();
    await waitForFlush();
    const raw = await readFile(path, "utf8");
    expect(JSON.parse(raw)).toEqual({});
  });

  it("creates parent directories on first write", async () => {
    const nested = join(dir, "a", "b", "c", "cache.json");
    const cache = fileCache({ path: nested });
    const now = Date.now();
    cache.set("K", { value: "v", cachedAt: now, expiresAt: now + 60_000 });
    await waitForFlush();
    const raw = await readFile(nested, "utf8");
    expect(JSON.parse(raw)).toMatchObject({ K: { value: "v" } });
  });
});
