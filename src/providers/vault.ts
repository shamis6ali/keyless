import type { Provider } from "../types";
import { KeylessError, ProviderError } from "../errors";

export type HashicorpVaultOptions = {
  /** Vault address, e.g. "https://vault.example.com:8200". */
  address: string;
  /** Auth token. Falls back to VAULT_TOKEN env var. */
  token?: string;
  /** KV v2 mount point. Default "secret". */
  mount?: string;
  /** Which field inside the KV blob to return. Default "value". */
  field?: string;
  /** Namespace header (Vault Enterprise). */
  namespace?: string;
  /** Map a Keyless key to a KV path. Default: identity. */
  resolveKey?: (key: string) => string;
  /** Override the provider name (default: "vault"). */
  name?: string;
  /** Inject a fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
};

type KvV2Response = {
  data?: {
    data?: Record<string, unknown>;
  };
};

export function hashicorpVault(options: HashicorpVaultOptions): Provider {
  const mount = options.mount ?? "secret";
  const field = options.field ?? "value";
  const resolveKey = options.resolveKey ?? ((k: string) => k);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const token =
    options.token ?? (typeof process !== "undefined" ? process.env.VAULT_TOKEN : undefined);

  if (!fetchImpl) {
    throw new KeylessError(
      "hashicorpVault requires a fetch implementation. Pass `fetch: globalThis.fetch` or upgrade to Node 18+.",
    );
  }
  if (!token) {
    throw new KeylessError(
      "hashicorpVault requires a token. Pass `token` in options or set the VAULT_TOKEN environment variable.",
    );
  }

  const baseUrl = options.address.replace(/\/+$/, "");

  return {
    name: options.name ?? "vault",
    async get(key) {
      const path = resolveKey(key);
      const url = `${baseUrl}/v1/${mount}/data/${encodeURI(path)}`;
      const headers: Record<string, string> = { "X-Vault-Token": token };
      if (options.namespace) headers["X-Vault-Namespace"] = options.namespace;

      let response: Response;
      try {
        response = await fetchImpl(url, { headers, method: "GET" });
      } catch (err) {
        throw new ProviderError("vault", key, err);
      }

      if (response.status === 404) return undefined;
      if (!response.ok) {
        throw new ProviderError(
          "vault",
          key,
          new Error(`Vault responded with ${response.status} ${response.statusText}`),
        );
      }

      const body = (await response.json()) as KvV2Response;
      const data = body.data?.data;
      if (!data) return undefined;
      const value = data[field];
      return typeof value === "string" && value.length > 0 ? value : undefined;
    },
  };
}
