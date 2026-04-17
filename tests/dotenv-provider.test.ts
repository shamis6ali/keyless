import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dotenvProvider, parseDotenv } from "../src/providers/dotenv";

describe("parseDotenv", () => {
  it("parses basic KEY=VALUE lines", () => {
    expect(parseDotenv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores comments and blank lines", () => {
    const src = "# comment\n\nFOO=bar\n# another\nBAZ=qux\n";
    expect(parseDotenv(src)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("strips surrounding quotes", () => {
    expect(parseDotenv('FOO="bar"\nBAZ=\'qux\'')).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("preserves = in values", () => {
    expect(parseDotenv("URL=postgres://user:pass=word@host")).toEqual({
      URL: "postgres://user:pass=word@host",
    });
  });
});

describe("dotenvProvider", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "keyless-dotenv-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads values from the given file", async () => {
    const path = join(dir, ".env");
    await writeFile(path, "STRIPE_SECRET=sk_test_123\nOTHER=hello\n");
    const provider = dotenvProvider({ path });
    expect(await provider.get("STRIPE_SECRET")).toBe("sk_test_123");
    expect(await provider.get("OTHER")).toBe("hello");
  });

  it("returns undefined for missing keys", async () => {
    const path = join(dir, ".env");
    await writeFile(path, "FOO=bar\n");
    const provider = dotenvProvider({ path });
    expect(await provider.get("BAZ")).toBeUndefined();
  });

  it("treats a missing file as empty (no throw)", async () => {
    const provider = dotenvProvider({ path: join(dir, ".env.missing") });
    expect(await provider.get("ANY")).toBeUndefined();
  });
});
