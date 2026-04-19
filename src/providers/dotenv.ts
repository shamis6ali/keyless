import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Provider } from "../types";

export type DotenvProviderOptions = {
  /** Path to the .env file. Defaults to `<cwd>/.env`. */
  path?: string;
  /** Override the provider name. */
  name?: string;
};

export function dotenvProvider(options: DotenvProviderOptions = {}): Provider {
  const filePath = options.path ?? resolve(process.cwd(), ".env");
  let cached: Record<string, string> | null = null;
  let loadPromise: Promise<Record<string, string>> | null = null;

  async function load(): Promise<Record<string, string>> {
    if (cached) return cached;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      let contents: string;
      try {
        contents = await readFile(filePath, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          cached = {};
          return cached;
        }
        throw err;
      }
      cached = parseDotenv(contents);
      return cached;
    })();
    return loadPromise;
  }

  return {
    name: options.name ?? "dotenv",
    async get(key) {
      const map = await load();
      const value = map[key];
      return typeof value === "string" && value.length > 0 ? value : undefined;
    },
  };
}

// Keys that would corrupt Object.prototype or downstream code if assigned
// to a regular object. Blocked even though we use a null-prototype object —
// belt and suspenders, in case the returned value is spread into an object
// literal by a caller (e.g. `{ ...parseDotenv(src) }`) which would reattach
// the default prototype.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function parseDotenv(src: string): Record<string, string> {
  // Null-prototype object: assignments to `__proto__` / `constructor` land
  // as own properties rather than mutating Object.prototype.
  const out = Object.create(null) as Record<string, string>;
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    if (UNSAFE_KEYS.has(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
