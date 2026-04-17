import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineKeyless } from "../src/define";
import { envProvider } from "../src/providers/env";
import {
  MissingSecretError,
  ProviderError,
  ValidationError,
} from "../src/errors";
import type { Provider } from "../src/types";

function fixtureProvider(
  name: string,
  values: Record<string, string | undefined>,
): Provider {
  return {
    name,
    async get(key) {
      return values[key];
    },
  };
}

describe("defineKeyless", () => {
  it("returns typed accessors that resolve validated values", async () => {
    const keys = defineKeyless({
      schema: {
        STRIPE_SECRET: z.string().startsWith("sk_"),
        PORT: z.string().regex(/^\d+$/),
      },
      providers: [envProvider({ source: { STRIPE_SECRET: "sk_123", PORT: "8080" } })],
    });

    expect(await keys.STRIPE_SECRET()).toBe("sk_123");
    expect(await keys.PORT()).toBe("8080");
  });

  it("caches values across successive calls", async () => {
    const get = vi.fn().mockResolvedValue("sk_abc");
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [{ name: "spy", get }],
    });
    await keys.K();
    await keys.K();
    await keys.K();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("deduplicates in-flight fetches for the same key", async () => {
    let resolves = 0;
    const get = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolves += 1;
            resolve(`sk_${resolves}`);
          }, 10);
        }),
    );
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [{ name: "slow", get }],
    });

    const [a, b, c] = await Promise.all([keys.K(), keys.K(), keys.K()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("falls through providers in order", async () => {
    const keys = defineKeyless({
      schema: { FOO: z.string() },
      providers: [
        fixtureProvider("first", { FOO: undefined }),
        fixtureProvider("second", { FOO: "from-second" }),
      ],
    });
    expect(await keys.FOO()).toBe("from-second");
    expect(keys.inspect().find((k) => k.name === "FOO")?.provider).toBe("second");
  });

  it("throws MissingSecretError when no provider has the value", async () => {
    const keys = defineKeyless({
      schema: { GONE: z.string() },
      providers: [fixtureProvider("empty", {})],
    });
    await expect(keys.GONE()).rejects.toBeInstanceOf(MissingSecretError);
  });

  it("throws ValidationError on schema mismatch, without leaking the value", async () => {
    const keys = defineKeyless({
      schema: { STRIPE_SECRET: z.string().startsWith("sk_") },
      providers: [fixtureProvider("x", { STRIPE_SECRET: "pk_wrong_prefix" })],
    });
    try {
      await keys.STRIPE_SECRET();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).not.toContain("pk_wrong_prefix");
    }
  });

  it("wraps provider failures in ProviderError", async () => {
    const keys = defineKeyless({
      schema: { BOOM: z.string() },
      providers: [
        {
          name: "broken",
          async get() {
            throw new Error("network down");
          },
        },
      ],
    });
    await expect(keys.BOOM()).rejects.toBeInstanceOf(ProviderError);
  });

  it("refresh() busts the cache and re-fetches", async () => {
    const values = { K: "v1" };
    const provider: Provider = {
      name: "mut",
      async get(key) {
        return values[key as keyof typeof values];
      },
    };
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [provider],
    });
    expect(await keys.K()).toBe("v1");
    values.K = "v2";
    expect(await keys.K()).toBe("v1");
    await keys.refresh("K");
    expect(await keys.K()).toBe("v2");
  });

  it("fires onRefresh when refreshing", async () => {
    const onRefresh = vi.fn();
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [fixtureProvider("p", { K: "hello" })],
      onRefresh,
    });
    await keys.K();
    await keys.refresh("K");
    expect(onRefresh).toHaveBeenCalledWith("K");
  });

  it("fires onAccess with cacheHit metadata", async () => {
    const onAccess = vi.fn();
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [fixtureProvider("p", { K: "hello" })],
      onAccess,
    });
    await keys.K();
    await keys.K();
    expect(onAccess).toHaveBeenCalledTimes(2);
    expect(onAccess.mock.calls[0]![1].cacheHit).toBe(false);
    expect(onAccess.mock.calls[1]![1].cacheHit).toBe(true);
  });

  it("eager mode surfaces validation errors via .ready", async () => {
    const keys = defineKeyless({
      schema: { K: z.string().startsWith("sk_") },
      providers: [fixtureProvider("p", { K: "wrong" })],
      mode: "eager",
    });
    await expect(keys.ready).rejects.toBeInstanceOf(ValidationError);
  });

  it("eager mode resolves .ready when all keys are valid", async () => {
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [fixtureProvider("p", { K: "ok" })],
      mode: "eager",
    });
    await expect(keys.ready).resolves.toBeUndefined();
  });

  it("prefetch warms the cache", async () => {
    const get = vi.fn(async (key: string) => (key === "A" ? "a" : "b"));
    const keys = defineKeyless({
      schema: { A: z.string(), B: z.string() },
      providers: [{ name: "spy", get }],
    });
    await keys.prefetch();
    expect(get).toHaveBeenCalledTimes(2);
    await keys.A();
    await keys.B();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("validate() collects errors across all keys", async () => {
    const keys = defineKeyless({
      schema: {
        OK: z.string(),
        BAD: z.string().startsWith("sk_"),
      },
      providers: [fixtureProvider("p", { OK: "ok", BAD: "nope" })],
    });
    await expect(keys.validate()).rejects.toThrow(/Validation failed for 1 key/);
  });

  it("clear() empties the cache and inspect() reflects it", async () => {
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [fixtureProvider("p", { K: "v" })],
    });
    await keys.K();
    expect(keys.inspect()[0]?.cachedAt).toBeTypeOf("number");
    keys.clear();
    expect(keys.inspect()[0]?.cachedAt).toBeNull();
    expect(keys.inspect()[0]?.provider).toBeNull();
  });

  it("honors per-key TTL overrides", async () => {
    vi.useFakeTimers();
    try {
      const get = vi.fn(async () => "v");
      const keys = defineKeyless({
        schema: { SHORT: z.string() },
        providers: [{ name: "p", get }],
        cache: { ttl: "1h" },
        overrides: { SHORT: { ttl: "100ms" } },
      });
      await keys.SHORT();
      vi.advanceTimersByTime(150);
      await keys.SHORT();
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("inspect() never exposes values", async () => {
    const keys = defineKeyless({
      schema: { SECRET: z.string() },
      providers: [fixtureProvider("p", { SECRET: "super-secret-token" })],
    });
    await keys.SECRET();
    const info = keys.inspect();
    const serialized = JSON.stringify(info);
    expect(serialized).not.toContain("super-secret-token");
  });

  it("throws when no providers are supplied", () => {
    expect(() =>
      defineKeyless({
        schema: { K: z.string() },
        providers: [],
      }),
    ).toThrow(/at least one provider/);
  });
});
