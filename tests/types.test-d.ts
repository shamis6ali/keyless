import { assertType, describe, it } from "vitest";
import { z } from "zod";
import { defineKeyless } from "../src/define";
import { envProvider } from "../src/providers/env";

describe("type inference", () => {
  it("infers accessor return types from zod schemas", async () => {
    const keys = defineKeyless({
      schema: {
        STRIPE_SECRET: z.string().startsWith("sk_"),
        PORT: z.coerce.number(),
        FLAGS: z.string().transform((s) => s.split(",")),
      },
      providers: [envProvider({ source: {} })],
    });

    assertType<Promise<string>>(keys.STRIPE_SECRET());
    assertType<Promise<number>>(keys.PORT());
    assertType<Promise<string[]>>(keys.FLAGS());
  });

  it("narrows refresh() to declared keys", () => {
    const keys = defineKeyless({
      schema: { A: z.string(), B: z.string() },
      providers: [envProvider({ source: {} })],
    });

    assertType<Promise<void>>(keys.refresh("A"));
    assertType<Promise<void>>(keys.refresh("B"));
    // @ts-expect-error - "C" is not in the schema
    keys.refresh("C");
  });
});
