import { describe, expect, it, vi } from "vitest";
import { awsSecretsManager } from "../src/providers/aws";

describe("awsSecretsManager", () => {
  it("uses the supplied getSecretValue fetcher and returns SecretString", async () => {
    const fetcher = vi.fn().mockResolvedValue({ SecretString: "sk_abc" });
    const provider = awsSecretsManager({ getSecretValue: fetcher });
    expect(await provider.get("STRIPE_SECRET")).toBe("sk_abc");
    expect(fetcher).toHaveBeenCalledWith({
      SecretId: "STRIPE_SECRET",
      VersionStage: "AWSCURRENT",
    });
  });

  it("decodes SecretBinary as UTF-8", async () => {
    const bin = new TextEncoder().encode("from-bytes");
    const provider = awsSecretsManager({
      getSecretValue: async () => ({ SecretBinary: bin }),
    });
    expect(await provider.get("K")).toBe("from-bytes");
  });

  it("returns undefined when neither string nor binary is present", async () => {
    const provider = awsSecretsManager({
      getSecretValue: async () => ({}),
    });
    expect(await provider.get("K")).toBeUndefined();
  });

  it("returns undefined on ResourceNotFoundException", async () => {
    const provider = awsSecretsManager({
      getSecretValue: async () => {
        const err: Error & { name: string } = new Error("not here") as Error & {
          name: string;
        };
        err.name = "ResourceNotFoundException";
        throw err;
      },
    });
    expect(await provider.get("GONE")).toBeUndefined();
  });

  it("propagates other errors", async () => {
    const provider = awsSecretsManager({
      getSecretValue: async () => {
        throw new Error("AccessDenied");
      },
    });
    await expect(provider.get("K")).rejects.toThrow("AccessDenied");
  });

  it("honors versionStage and resolveKey", async () => {
    const fetcher = vi.fn().mockResolvedValue({ SecretString: "v" });
    const provider = awsSecretsManager({
      getSecretValue: fetcher,
      versionStage: "AWSPREVIOUS",
      resolveKey: (k) => `prod/${k}`,
    });
    await provider.get("STRIPE_SECRET");
    expect(fetcher).toHaveBeenCalledWith({
      SecretId: "prod/STRIPE_SECRET",
      VersionStage: "AWSPREVIOUS",
    });
  });

});
