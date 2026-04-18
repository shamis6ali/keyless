import type { Provider } from "../types";
import { KeylessError } from "../errors";

export type AwsGetSecretValueInput = {
  SecretId: string;
  VersionStage?: string;
  VersionId?: string;
};

export type AwsGetSecretValueResponse = {
  SecretString?: string;
  SecretBinary?: Uint8Array;
};

export type AwsSecretsManagerClient = {
  send(command: { input: AwsGetSecretValueInput }): Promise<AwsGetSecretValueResponse>;
};

export type AwsSecretsManagerOptions = {
  region?: string;
  /** VersionStage to fetch. Defaults to "AWSCURRENT". */
  versionStage?: string;
  /** Map a Keyless key to the AWS SecretId. Default: identity. */
  resolveKey?: (key: string) => string;
  /** Override the provider name (default: "aws"). */
  name?: string;
  /**
   * Escape hatch: provide a function that fetches a secret value, bypassing
   * the SDK entirely. Primary DI point for tests and custom auth.
   */
  getSecretValue?: (input: AwsGetSecretValueInput) => Promise<AwsGetSecretValueResponse>;
};

const INSTALL_HINT =
  'awsSecretsManager requires "@aws-sdk/client-secrets-manager" at runtime. Install it with `pnpm add @aws-sdk/client-secrets-manager` (or npm/yarn equivalent).';

function decodeSecret(response: AwsGetSecretValueResponse): string | undefined {
  if (typeof response.SecretString === "string" && response.SecretString.length > 0) {
    return response.SecretString;
  }
  if (response.SecretBinary && response.SecretBinary.byteLength > 0) {
    return new TextDecoder().decode(response.SecretBinary);
  }
  return undefined;
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string } | null | undefined)?.name;
  return name === "ResourceNotFoundException";
}

export function awsSecretsManager(options: AwsSecretsManagerOptions = {}): Provider {
  const versionStage = options.versionStage ?? "AWSCURRENT";
  const resolveKey = options.resolveKey ?? ((k: string) => k);
  let fetcherPromise: Promise<(input: AwsGetSecretValueInput) => Promise<AwsGetSecretValueResponse>> | null = null;

  async function getFetcher() {
    if (options.getSecretValue) return options.getSecretValue;
    if (!fetcherPromise) {
      fetcherPromise = (async () => {
        try {
          const mod = (await import(
            /* @vite-ignore */ "@aws-sdk/client-secrets-manager"
          )) as unknown as {
            SecretsManagerClient: new (config?: { region?: string }) => AwsSecretsManagerClient;
            GetSecretValueCommand: new (input: AwsGetSecretValueInput) => {
              input: AwsGetSecretValueInput;
            };
          };
          const client = new mod.SecretsManagerClient({ region: options.region });
          return async (input: AwsGetSecretValueInput) => {
            const command = new mod.GetSecretValueCommand(input);
            return client.send(command);
          };
        } catch {
          throw new KeylessError(INSTALL_HINT);
        }
      })();
    }
    return fetcherPromise;
  }

  return {
    name: options.name ?? "aws",
    async get(key) {
      const fetch = await getFetcher();
      const secretId = resolveKey(key);
      try {
        const response = await fetch({ SecretId: secretId, VersionStage: versionStage });
        return decodeSecret(response);
      } catch (err) {
        if (isNotFound(err)) return undefined;
        throw err;
      }
    },
  };
}
