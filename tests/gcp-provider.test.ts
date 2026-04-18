import { describe, expect, it, vi } from "vitest";
import { gcpSecretManager } from "../src/providers/gcp";
import type { GcpSecretManagerClient } from "../src/providers/gcp";

function fakeClient(responder: (name: string) => { data: Uint8Array | string | null } | null): {
  client: GcpSecretManagerClient;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    client: {
      async accessSecretVersion({ name }) {
        calls.push(name);
        const payload = responder(name);
        if (!payload) {
          const err: Error & { code?: number } = new Error("NOT_FOUND");
          err.code = 5;
          throw err;
        }
        return [{ payload }];
      },
    },
  };
}

describe("gcpSecretManager", () => {
  it("builds the full resource name and returns the string payload", async () => {
    const { client, calls } = fakeClient(() => ({ data: "sk_live_abc" }));
    const provider = gcpSecretManager({
      projectId: "my-project",
      client,
    });
    expect(await provider.get("STRIPE_SECRET")).toBe("sk_live_abc");
    expect(calls[0]).toBe(
      "projects/my-project/secrets/STRIPE_SECRET/versions/latest",
    );
  });

  it("decodes Uint8Array payloads as UTF-8", async () => {
    const payload = new TextEncoder().encode("hello-bytes");
    const { client } = fakeClient(() => ({ data: payload }));
    const provider = gcpSecretManager({ projectId: "p", client });
    expect(await provider.get("K")).toBe("hello-bytes");
  });

  it("returns undefined on NOT_FOUND", async () => {
    const { client } = fakeClient(() => null);
    const provider = gcpSecretManager({ projectId: "p", client });
    expect(await provider.get("MISSING")).toBeUndefined();
  });

  it("honors a custom version", async () => {
    const { client, calls } = fakeClient(() => ({ data: "v" }));
    const provider = gcpSecretManager({ projectId: "p", version: "3", client });
    await provider.get("K");
    expect(calls[0]).toContain("/versions/3");
  });

  it("applies resolveKey to the secret short name", async () => {
    const { client, calls } = fakeClient(() => ({ data: "v" }));
    const provider = gcpSecretManager({
      projectId: "p",
      resolveKey: (k) => `prod-${k.toLowerCase()}`,
      client,
    });
    await provider.get("STRIPE_SECRET");
    expect(calls[0]).toBe("projects/p/secrets/prod-stripe_secret/versions/latest");
  });

  it("propagates non-404 errors", async () => {
    const client: GcpSecretManagerClient = {
      async accessSecretVersion() {
        throw new Error("network boom");
      },
    };
    const provider = gcpSecretManager({ projectId: "p", client });
    await expect(provider.get("K")).rejects.toThrow("network boom");
  });

});
