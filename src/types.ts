import type { z } from "zod";

export type SchemaMap = Record<string, z.ZodType>;

export type Provider = {
  readonly name: string;
  get(key: string): Promise<string | undefined>;
};

export type CacheEntry = {
  value: unknown;
  cachedAt: number;
  expiresAt: number;
};

export type Cache = {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
  delete(key: string): void;
  clear(): void;
  entries(): Array<[string, CacheEntry]>;
};

export type TtlInput = string | number;

export type CacheOptions = {
  ttl?: TtlInput;
  backend?: Cache;
};

export type AccessMeta = {
  cacheHit: boolean;
  provider: string | null;
  durationMs: number;
};

export type KeyInfo = {
  name: string;
  provider: string | null;
  cachedAt: number | null;
  expiresAt: number | null;
};

export type KeylessMode = "eager" | "lazy";

export type ErrorContext = {
  key?: string;
  provider?: string;
};

export type RefreshFn = () => Promise<string>;

export type KeyOverride = {
  ttl?: TtlInput;
  /**
   * Custom fetcher that bypasses the provider chain for this key. Invoked on
   * initial fetch and on every cache miss. Ideal for OAuth-style tokens that
   * need to be renewed via a refresh_token exchange rather than re-fetched
   * from a secret store.
   */
  refresh?: RefreshFn;
};

export type KeylessOptions<S extends SchemaMap> = {
  schema: S;
  providers: Provider[];
  cache?: CacheOptions;
  overrides?: { [K in keyof S]?: KeyOverride };
  mode?: KeylessMode;
  onAccess?: (key: keyof S & string, meta: AccessMeta) => void;
  onRefresh?: (key: keyof S & string) => void;
  onError?: (err: Error, context: ErrorContext) => void;
};

type KeylessAccessors<S extends SchemaMap> = {
  [K in keyof S]: () => Promise<z.infer<S[K]>>;
};

export type Keyless<S extends SchemaMap> = KeylessAccessors<S> & {
  readonly ready: Promise<void>;
  refresh(key: keyof S & string): Promise<void>;
  prefetch(): Promise<void>;
  validate(): Promise<void>;
  clear(): void;
  inspect(): KeyInfo[];
};
