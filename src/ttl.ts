import type { TtlInput } from "./types";

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseTtl(input: TtlInput): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error(`Invalid TTL: ${input}`);
    }
    return input;
  }

  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i.exec(input.trim());
  if (!match) {
    throw new Error(
      `Invalid TTL string: "${input}". Use e.g. "500ms", "60s", "5m", "1h", "1d", or a number of ms.`,
    );
  }

  const value = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multiplier = UNIT_MS[unit]!;
  return value * multiplier;
}
