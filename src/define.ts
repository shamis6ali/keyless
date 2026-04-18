import type {
  Cache,
  KeyInfo,
  Keyless,
  KeylessOptions,
  Provider,
  SchemaMap,
  TtlInput,
} from "./types";
import { memoryCache } from "./cache/memory";
import {
  ClientBoundaryError,
  KeylessError,
  MissingSecretError,
  ProviderError,
  ValidationError,
} from "./errors";
import { parseTtl } from "./ttl";

const DEFAULT_TTL: TtlInput = "5m";

function assertServerSide(): void {
  const hasWindow = typeof (globalThis as { window?: unknown }).window !== "undefined";
  const hasDocument = typeof (globalThis as { document?: unknown }).document !== "undefined";
  if (hasWindow && hasDocument) {
    throw new ClientBoundaryError();
  }
}

export function defineKeyless<S extends SchemaMap>(options: KeylessOptions<S>): Keyless<S> {
  assertServerSide();

  const {
    schema,
    providers,
    cache: cacheOptions,
    overrides,
    mode = "lazy",
    onAccess,
    onRefresh,
    onError,
  } = options;

  if (providers.length === 0) {
    throw new KeylessError("defineKeyless requires at least one provider");
  }

  const cache: Cache = cacheOptions?.backend ?? memoryCache();
  const defaultTtlMs = parseTtl(cacheOptions?.ttl ?? DEFAULT_TTL);
  const inflight = new Map<string, Promise<unknown>>();
  const providerOf = new Map<string, string>();
  const keyNames = Object.keys(schema) as Array<keyof S & string>;

  function ttlFor(key: string): number {
    const override = overrides?.[key as keyof S]?.ttl;
    return override !== undefined ? parseTtl(override) : defaultTtlMs;
  }

  async function fetchAndValidate(
    key: string,
  ): Promise<{ value: unknown; provider: string }> {
    const refreshFn = overrides?.[key as keyof S]?.refresh;
    let rawValue: string | undefined;
    let sourceName: string | null = null;

    if (refreshFn) {
      try {
        rawValue = await refreshFn();
        sourceName = "refresh";
      } catch (err) {
        const providerErr = new ProviderError("refresh", key, err);
        onError?.(providerErr, { key, provider: "refresh" });
        throw providerErr;
      }
      if (typeof rawValue !== "string" || rawValue.length === 0) {
        const missing = new MissingSecretError(key, ["refresh"]);
        onError?.(missing, { key, provider: "refresh" });
        throw missing;
      }
    } else {
      const tried: string[] = [];
      for (const provider of providers) {
        tried.push(provider.name);
        try {
          const result = await provider.get(key);
          if (result !== undefined) {
            rawValue = result;
            sourceName = provider.name;
            break;
          }
        } catch (err) {
          const providerErr = new ProviderError(provider.name, key, err);
          onError?.(providerErr, { key, provider: provider.name });
          throw providerErr;
        }
      }

      if (rawValue === undefined || !sourceName) {
        const missing = new MissingSecretError(key, tried);
        onError?.(missing, { key });
        throw missing;
      }
    }

    const schemaForKey = schema[key];
    if (!schemaForKey) {
      throw new KeylessError(`Unknown key: "${key}"`);
    }

    const parsed = schemaForKey.safeParse(rawValue);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message);
      const ve = new ValidationError(key, issues);
      onError?.(ve, { key, provider: sourceName });
      throw ve;
    }

    return { value: parsed.data, provider: sourceName };
  }

  async function access(key: string): Promise<unknown> {
    const start = Date.now();

    const cached = cache.get(key);
    if (cached) {
      onAccess?.(key as keyof S & string, {
        cacheHit: true,
        provider: providerOf.get(key) ?? null,
        durationMs: Date.now() - start,
      });
      return cached.value;
    }

    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const { value, provider } = await fetchAndValidate(key);
        const now = Date.now();
        cache.set(key, { value, cachedAt: now, expiresAt: now + ttlFor(key) });
        providerOf.set(key, provider);
        onAccess?.(key as keyof S & string, {
          cacheHit: false,
          provider,
          durationMs: Date.now() - start,
        });
        return value;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  async function prefetch(): Promise<void> {
    await Promise.all(keyNames.map((k) => access(k)));
  }

  async function validate(): Promise<void> {
    const errors: Error[] = [];
    await Promise.all(
      keyNames.map(async (k) => {
        try {
          await fetchAndValidate(k);
        } catch (err) {
          errors.push(err as Error);
        }
      }),
    );
    if (errors.length > 0) {
      throw new KeylessError(
        `Validation failed for ${errors.length} key(s): ${errors.map((e) => e.message).join(" | ")}`,
      );
    }
  }

  async function refresh(key: keyof S & string): Promise<void> {
    cache.delete(key);
    providerOf.delete(key);
    onRefresh?.(key);
    await access(key);
  }

  function clear(): void {
    cache.clear();
    providerOf.clear();
  }

  function inspect(): KeyInfo[] {
    return keyNames.map((key) => {
      const entry = cache.get(key);
      return {
        name: key,
        provider: providerOf.get(key) ?? null,
        cachedAt: entry?.cachedAt ?? null,
        expiresAt: entry?.expiresAt ?? null,
      };
    });
  }

  const accessors = {} as { [K in keyof S]: () => Promise<unknown> };
  for (const key of keyNames) {
    (accessors as Record<string, () => Promise<unknown>>)[key] = () => access(key);
  }

  const ready = mode === "eager" ? prefetch() : Promise.resolve();
  if (mode === "eager") {
    // Prevent unhandled rejection if the user never awaits `.ready`.
    // First access will still surface the error.
    ready.catch(() => undefined);
  }

  return {
    ...accessors,
    ready,
    refresh,
    prefetch,
    validate,
    clear,
    inspect,
  } as Keyless<S>;
}
