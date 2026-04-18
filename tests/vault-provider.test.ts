import { describe, expect, it, vi } from "vitest";
import { hashicorpVault } from "../src/providers/vault";
import { ProviderError } from "../src/errors";

function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): typeof globalThis.fetch {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init ?? {});
  });
  return fn as unknown as typeof globalThis.fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("hashicorpVault", () => {
  it("fetches from the KV v2 data endpoint and returns the configured field", async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("https://vault.example.com/v1/secret/data/STRIPE_SECRET");
      expect((init.headers as Record<string, string>)["X-Vault-Token"]).toBe("t0ken");
      return jsonResponse({ data: { data: { value: "sk_live" } } });
    });
    const provider = hashicorpVault({
      address: "https://vault.example.com",
      token: "t0ken",
      fetch,
    });
    expect(await provider.get("STRIPE_SECRET")).toBe("sk_live");
  });

  it("uses a custom mount and field", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("https://v/v1/kv-prod/data/K");
      return jsonResponse({ data: { data: { password: "hunter2" } } });
    });
    const provider = hashicorpVault({
      address: "https://v",
      token: "t",
      mount: "kv-prod",
      field: "password",
      fetch,
    });
    expect(await provider.get("K")).toBe("hunter2");
  });

  it("returns undefined on 404", async () => {
    const fetch = mockFetch(() => new Response("", { status: 404 }));
    const provider = hashicorpVault({ address: "https://v", token: "t", fetch });
    expect(await provider.get("GONE")).toBeUndefined();
  });

  it("returns undefined when the field is missing from the blob", async () => {
    const fetch = mockFetch(() =>
      jsonResponse({ data: { data: { other: "x" } } }),
    );
    const provider = hashicorpVault({ address: "https://v", token: "t", fetch });
    expect(await provider.get("K")).toBeUndefined();
  });

  it("wraps HTTP errors in ProviderError", async () => {
    const fetch = mockFetch(
      () => new Response("forbidden", { status: 403, statusText: "Forbidden" }),
    );
    const provider = hashicorpVault({ address: "https://v", token: "t", fetch });
    await expect(provider.get("K")).rejects.toBeInstanceOf(ProviderError);
  });

  it("sends the Vault namespace header when provided", async () => {
    const fetch = mockFetch((_url, init) => {
      expect((init.headers as Record<string, string>)["X-Vault-Namespace"]).toBe(
        "team-a",
      );
      return jsonResponse({ data: { data: { value: "v" } } });
    });
    const provider = hashicorpVault({
      address: "https://v",
      token: "t",
      namespace: "team-a",
      fetch,
    });
    await provider.get("K");
  });

  it("reads VAULT_TOKEN from env when no token is supplied", async () => {
    process.env.VAULT_TOKEN = "env-token";
    try {
      const fetch = mockFetch((_url, init) => {
        expect((init.headers as Record<string, string>)["X-Vault-Token"]).toBe(
          "env-token",
        );
        return jsonResponse({ data: { data: { value: "v" } } });
      });
      const provider = hashicorpVault({ address: "https://v", fetch });
      await provider.get("K");
    } finally {
      delete process.env.VAULT_TOKEN;
    }
  });

  it("throws at init when no token is available", () => {
    expect(() => hashicorpVault({ address: "https://v" })).toThrow(/token/);
  });

  it("strips trailing slashes from the address", async () => {
    const fetch = mockFetch((url) => {
      expect(url).toBe("https://v/v1/secret/data/K");
      return jsonResponse({ data: { data: { value: "v" } } });
    });
    const provider = hashicorpVault({ address: "https://v///", token: "t", fetch });
    await provider.get("K");
  });
});
