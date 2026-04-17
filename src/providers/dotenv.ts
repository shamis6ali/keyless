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

export function parseDotenv(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
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
