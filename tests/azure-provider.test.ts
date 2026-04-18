import { describe, expect, it, vi } from "vitest";
import { azureKeyVault } from "../src/providers/azure";
import type { AzureKeyVaultClient } from "../src/providers/azure";

describe("azureKeyVault", () => {
  it("calls getSecret and returns the value", async () => {
    const getSecret = vi.fn().mockResolvedValue({ value: "sk_abc" });
    const client: AzureKeyVaultClient = { getSecret };
    const provider = azureKeyVault({
      vaultUrl: "https://vault.example.com",
      client,
    });
    expect(await provider.get("STRIPE_SECRET")).toBe("sk_abc");
    expect(getSecret).toHaveBeenCalledWith("STRIPE_SECRET", undefined);
  });

  it("passes version when supplied", async () => {
    const getSecret = vi.fn().mockResolvedValue({ value: "v" });
    const provider = azureKeyVault({
      vaultUrl: "https://vault.example.com",
      version: "abc123",
      client: { getSecret },
    });
    await provider.get("K");
    expect(getSecret).toHaveBeenCalledWith("K", { version: "abc123" });
  });

  it("returns undefined when value is absent", async () => {
    const client: AzureKeyVaultClient = { async getSecret() { return {}; } };
    const provider = azureKeyVault({ vaultUrl: "https://v", client });
    expect(await provider.get("K")).toBeUndefined();
  });

  it("returns undefined on SecretNotFound", async () => {
    const client: AzureKeyVaultClient = {
      async getSecret() {
        const err: Error & { code?: string } = new Error("not found");
        err.code = "SecretNotFound";
        throw err;
      },
    };
    const provider = azureKeyVault({ vaultUrl: "https://v", client });
    expect(await provider.get("GONE")).toBeUndefined();
  });

  it("returns undefined on 404 statusCode", async () => {
    const client: AzureKeyVaultClient = {
      async getSecret() {
        const err: Error & { statusCode?: number } = new Error("404");
        err.statusCode = 404;
        throw err;
      },
    };
    const provider = azureKeyVault({ vaultUrl: "https://v", client });
    expect(await provider.get("GONE")).toBeUndefined();
  });

  it("applies resolveKey to the secret name", async () => {
    const getSecret = vi.fn().mockResolvedValue({ value: "v" });
    const provider = azureKeyVault({
      vaultUrl: "https://v",
      resolveKey: (k) => `prod-${k}`,
      client: { getSecret },
    });
    await provider.get("K");
    expect(getSecret).toHaveBeenCalledWith("prod-K", undefined);
  });

});
