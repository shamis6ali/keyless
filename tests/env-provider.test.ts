import { describe, expect, it } from "vitest";
import { envProvider } from "../src/providers/env";

describe("envProvider", () => {
  it("reads from the supplied source", async () => {
    const provider = envProvider({ source: { FOO: "bar" } });
    expect(await provider.get("FOO")).toBe("bar");
  });

  it("returns undefined for missing keys", async () => {
    const provider = envProvider({ source: {} });
    expect(await provider.get("NOPE")).toBeUndefined();
  });

  it("returns undefined for empty strings", async () => {
    const provider = envProvider({ source: { EMPTY: "" } });
    expect(await provider.get("EMPTY")).toBeUndefined();
  });

  it("defaults to process.env", async () => {
    process.env.__KEYLESS_TEST__ = "hello";
    try {
      const provider = envProvider();
      expect(await provider.get("__KEYLESS_TEST__")).toBe("hello");
    } finally {
      delete process.env.__KEYLESS_TEST__;
    }
  });

  it("uses a custom name when supplied", () => {
    const provider = envProvider({ name: "custom-env" });
    expect(provider.name).toBe("custom-env");
  });
});
