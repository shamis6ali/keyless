import { beforeAll, bench, describe } from "vitest";
import { z } from "zod";
import { defineKeyless } from "../src/define";
import { envProvider } from "../src/providers/env";

describe("defineKeyless — hot path", () => {
  const keys = defineKeyless({
    schema: {
      A: z.string(),
      B: z.string(),
      C: z.string().min(1),
    },
    providers: [envProvider({ source: { A: "a", B: "b", C: "c" } })],
    cache: { ttl: "1h" },
  });

  beforeAll(async () => {
    await keys.prefetch();
  });

  bench("access (cache hit)", async () => {
    await keys.A();
  });

  bench("access (cache hit, 3 keys)", async () => {
    await Promise.all([keys.A(), keys.B(), keys.C()]);
  });
});

describe("defineKeyless — cold path", () => {
  bench("access (cache miss, single provider, single key)", async () => {
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [envProvider({ source: { K: "v" } })],
    });
    await keys.K();
  });

  bench("access (cache miss, fallthrough past 3 providers)", async () => {
    const keys = defineKeyless({
      schema: { K: z.string() },
      providers: [
        envProvider({ source: {}, name: "p1" }),
        envProvider({ source: {}, name: "p2" }),
        envProvider({ source: { K: "v" }, name: "p3" }),
      ],
    });
    await keys.K();
  });
});

describe("defineKeyless — introspection", () => {
  const schema = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`K${i}`, z.string()]),
  ) as Record<`K${number}`, z.ZodString>;
  const source = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`K${i}`, `v${i}`]),
  );
  const keys = defineKeyless({
    schema,
    providers: [envProvider({ source })],
  });

  beforeAll(async () => {
    await keys.prefetch();
  });

  bench("inspect (20 keys)", () => {
    keys.inspect();
  });
});
