import type { Provider } from "../types";
import { KeylessError } from "../errors";

export type AzureKeyVaultSecret = {
  value?: string;
};

export type AzureKeyVaultClient = {
  getSecret(name: string, options?: { version?: string }): Promise<AzureKeyVaultSecret>;
};

export type AzureKeyVaultOptions = {
  /** Vault URL, e.g. "https://my-vault.vault.azure.net". */
  vaultUrl: string;
  /** Optional version. Defaults to latest. */
  version?: string;
  /** Map a Keyless key to an Azure secret name. Default: identity. */
  resolveKey?: (key: string) => string;
  /** Override the provider name (default: "azure"). */
  name?: string;
  /** Supply a pre-configured SecretClient. Primary DI point for tests. */
  client?: AzureKeyVaultClient;
};

const INSTALL_HINT =
  'azureKeyVault requires "@azure/keyvault-secrets" and "@azure/identity" at runtime. Install them with `pnpm add @azure/keyvault-secrets @azure/identity`.';

function isNotFound(err: unknown): boolean {
  const code = (err as { code?: string; statusCode?: number } | null | undefined);
  return code?.code === "SecretNotFound" || code?.statusCode === 404;
}

export function azureKeyVault(options: AzureKeyVaultOptions): Provider {
  const resolveKey = options.resolveKey ?? ((k: string) => k);
  let clientPromise: Promise<AzureKeyVaultClient> | null = null;

  async function getClient(): Promise<AzureKeyVaultClient> {
    if (options.client) return options.client;
    if (!clientPromise) {
      clientPromise = (async () => {
        try {
          const [kv, identity] = (await Promise.all([
            import(/* @vite-ignore */ "@azure/keyvault-secrets"),
            import(/* @vite-ignore */ "@azure/identity"),
          ])) as unknown as [
            { SecretClient: new (url: string, credential: unknown) => AzureKeyVaultClient },
            { DefaultAzureCredential: new () => unknown },
          ];
          const credential = new identity.DefaultAzureCredential();
          return new kv.SecretClient(options.vaultUrl, credential);
        } catch {
          throw new KeylessError(INSTALL_HINT);
        }
      })();
    }
    return clientPromise;
  }

  return {
    name: options.name ?? "azure",
    async get(key) {
      const client = await getClient();
      const secretName = resolveKey(key);
      try {
        const response = await client.getSecret(
          secretName,
          options.version ? { version: options.version } : undefined,
        );
        return typeof response.value === "string" && response.value.length > 0
          ? response.value
          : undefined;
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    },
  };
}
