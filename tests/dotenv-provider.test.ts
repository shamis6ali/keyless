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

  it("does not pollute Object.prototype via __proto__ assignment", () => {
    // Snapshot Object.prototype before the attack attempt so we can detect
    // any unexpected additions.
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const result = parseDotenv("__proto__=pwned\nNORMAL=ok");
    const after = Object.getOwnPropertyNames(Object.prototype).sort();

    expect(after).toEqual(before);
    // A fresh object should not have inherited a `pwned` property.
    expect(({} as Record<string, unknown>).pwned).toBeUndefined();
    // The benign key should still be parsed.
    expect(result.NORMAL).toBe("ok");
    // The dangerous key should not appear in the result at all.
    expect(Object.keys(result)).not.toContain("__proto__");
  });

  it("ignores constructor and prototype as keys", () => {
    const result = parseDotenv("constructor=evil\nprototype=bad\nOK=fine");
    expect(Object.keys(result)).toEqual(["OK"]);
    expect(result.OK).toBe("fine");
  });

  it("returns a null-prototype object so spread does not inherit pollution", () => {
    const result = parseDotenv("FOO=bar");
    expect(Object.getPrototypeOf(result)).toBeNull();
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
