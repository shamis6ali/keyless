import type { Provider } from "../types";

export type EnvProviderOptions = {
  /** Override the source of env vars. Defaults to `process.env`. */
  source?: Record<string, string | undefined>;
  /** Override the provider name (useful when layering multiple env providers). */
  name?: string;
};

export function envProvider(options: EnvProviderOptions = {}): Provider {
  const source =
    options.source ??
    (typeof process !== "undefined" && process.env
      ? (process.env as Record<string, string | undefined>)
      : {});
  return {
    name: options.name ?? "env",
    async get(key) {
      const value = source[key];
      return typeof value === "string" && value.length > 0 ? value : undefined;
    },
  };
}
