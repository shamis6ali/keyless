import type { Provider } from "../types";
import { KeylessError } from "../errors";

export type GcpSecretPayload = {
  data?: Uint8Array | string | null;
};

export type GcpSecretVersionResponse = {
  payload?: GcpSecretPayload | null;
};

export type GcpSecretManagerClient = {
  accessSecretVersion(request: {
    name: string;
  }): Promise<[GcpSecretVersionResponse, ...unknown[]]>;
};

export type GcpSecretManagerOptions = {
  projectId: string;
  /** Secret version. Defaults to "latest". */
  version?: string;
  /** Map a Keyless key to a GCP secret short name. Default: identity. */
  resolveKey?: (key: string) => string;
  /** Override the provider name (default: "gcp"). */
  name?: string;
  /** Supply a pre-configured client (and skip dynamic SDK import). Primary DI point for tests. */
  client?: GcpSecretManagerClient;
};

const INSTALL_HINT =
  'gcpSecretManager requires "@google-cloud/secret-manager" at runtime. Install it with `pnpm add @google-cloud/secret-manager` (or npm/yarn equivalent).';

function decode(data: Uint8Array | string | null | undefined): string | undefined {
  if (data == null) return undefined;
  if (typeof data === "string") return data.length > 0 ? data : undefined;
  const decoded = new TextDecoder().decode(data);
  return decoded.length > 0 ? decoded : undefined;
}

function isNotFound(err: unknown): boolean {
  const code = (err as { code?: number | string } | null | undefined)?.code;
  return code === 5 || code === "NOT_FOUND" || code === "5";
}

export function gcpSecretManager(options: GcpSecretManagerOptions): Provider {
  const version = options.version ?? "latest";
  const resolveKey = options.resolveKey ?? ((k: string) => k);
  let clientPromise: Promise<GcpSecretManagerClient> | null = null;

  async function getClient(): Promise<GcpSecretManagerClient> {
    if (options.client) return options.client;
    if (!clientPromise) {
      clientPromise = (async () => {
        try {
          const mod = (await import(
            /* @vite-ignore */ "@google-cloud/secret-manager"
          )) as unknown as {
            SecretManagerServiceClient: new () => GcpSecretManagerClient;
          };
          return new mod.SecretManagerServiceClient();
        } catch {
          throw new KeylessError(INSTALL_HINT);
        }
      })();
    }
    return clientPromise;
  }

  return {
    name: options.name ?? "gcp",
    async get(key) {
      const client = await getClient();
      const shortName = resolveKey(key);
      const resourceName = `projects/${options.projectId}/secrets/${shortName}/versions/${version}`;
      try {
        const [response] = await client.accessSecretVersion({ name: resourceName });
        return decode(response?.payload?.data ?? null);
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    },
  };
}
