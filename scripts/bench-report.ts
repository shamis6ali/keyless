import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Bench } from "tinybench";
import { z } from "zod";
import { createEnv } from "@t3-oss/env-core";
import { cleanEnv, str } from "envalid";
import { defineKeyless } from "../src/define";
import { envProvider } from "../src/providers/env";

type Result = { name: string; hz: number; nsPerOp: number };

const TEST_ENV = {
  STRIPE_SECRET: "sk_test_abc123",
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  JWT_SECRET: "this-secret-is-at-least-thirty-two-chars-long",
};

// Populate process.env so dotenv-style lookups find values.
Object.assign(process.env, TEST_ENV);

// --- Library setups ---

const keyless = defineKeyless({
  schema: {
    STRIPE_SECRET: z.string().startsWith("sk_"),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
  },
  providers: [envProvider({ source: TEST_ENV })],
  cache: { ttl: "1h" },
});
await keyless.prefetch();

const envalidEnv = cleanEnv(TEST_ENV, {
  STRIPE_SECRET: str(),
  DATABASE_URL: str(),
  JWT_SECRET: str(),
});

const t3Env = createEnv({
  server: {
    STRIPE_SECRET: z.string().startsWith("sk_"),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
  },
  runtimeEnv: TEST_ENV,
  emptyStringAsUndefined: false,
});

// --- Helpers ---

function collect(bench: Bench): Result[] {
  return bench.tasks.map((t) => {
    const hz = t.result?.hz ?? 0;
    return { name: t.name, hz, nsPerOp: hz > 0 ? 1e9 / hz : 0 };
  });
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

function chartBlock(title: string, results: Result[]): string {
  const max = Math.max(...results.map((r) => r.hz));
  const yMax = Math.ceil((max * 1.1) / 1_000_000) * 1_000_000 || 1_000_000;
  const xAxis = results.map((r) => `"${r.name}"`).join(", ");
  const bars = results.map((r) => Math.round(r.hz)).join(", ");
  return [
    "```mermaid",
    "xychart-beta",
    `    title "${title}"`,
    `    x-axis [${xAxis}]`,
    `    y-axis "Operations per second" 0 --> ${yMax}`,
    `    bar [${bars}]`,
    "```",
  ].join("\n");
}

function tableBlock(results: Result[]): string {
  const fastest = Math.max(...results.map((r) => r.hz));
  const lines = [
    "| Library | ops/sec | ns/op | Relative |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const r of results) {
    const relative = fastest > 0 ? `${((r.hz / fastest) * 100).toFixed(1)}%` : "—";
    lines.push(
      `| ${r.name} | ${fmt(r.hz)} | ${r.nsPerOp.toFixed(1)} | ${relative} |`,
    );
  }
  return lines.join("\n");
}

// --- Comparison: per-secret access (hot path) ---

const compBench = new Bench({ time: 1000 });
compBench
  .add("keyless (cache hit)", async () => {
    await keyless.STRIPE_SECRET();
  })
  .add("dotenv (process.env)", () => {
    return process.env.STRIPE_SECRET;
  })
  .add("envalid", () => {
    return envalidEnv.STRIPE_SECRET;
  })
  .add("t3-env", () => {
    return t3Env.STRIPE_SECRET;
  });

console.log("Running comparison benchmarks...");
await compBench.run();
const compResults = collect(compBench);

// --- Internal: cache paths ---

const internalBench = new Bench({ time: 1000 });
internalBench
  .add("cache hit", async () => {
    await keyless.STRIPE_SECRET();
  })
  .add("cache miss (1 provider)", async () => {
    const k = defineKeyless({
      schema: { K: z.string() },
      providers: [envProvider({ source: { K: "v" } })],
    });
    await k.K();
  })
  .add("cache miss (3-provider fallthrough)", async () => {
    const k = defineKeyless({
      schema: { K: z.string() },
      providers: [
        envProvider({ source: {}, name: "p1" }),
        envProvider({ source: {}, name: "p2" }),
        envProvider({ source: { K: "v" }, name: "p3" }),
      ],
    });
    await k.K();
  });

console.log("Running internal path benchmarks...");
await internalBench.run();
const internalResults = collect(internalBench);

// --- Build report ---

const keylessComp = compResults.find((r) => r.name.startsWith("keyless"))!;
const dotenvComp = compResults.find((r) => r.name.startsWith("dotenv"))!;
const t3EnvComp = compResults.find((r) => r.name.startsWith("t3-env"))!;
const overheadVsDotenvNs = keylessComp.nsPerOp - dotenvComp.nsPerOp;
const overheadVsT3Ns = keylessComp.nsPerOp - t3EnvComp.nsPerOp;

let hotTakeaway: string;
if (overheadVsDotenvNs <= 0) {
  const faster = Math.abs(overheadVsDotenvNs);
  hotTakeaway = `Keyless cache-hit access is **~${Math.round(faster)} ns faster** than raw \`process.env\` here — Node's \`process.env\` is a getter-backed object that does string coercion on each read, so a hot in-process cache can actually beat it. Compared to startup-validated tools like \`envalid\` and \`@t3-oss/env-core\` (frozen plain objects, sync property reads), Keyless pays **~${Math.round(overheadVsT3Ns)} ns** extra per access. That's the cost of the \`Promise\` boundary plus cache lookup — in exchange for provider fallthrough, automatic refresh, and rotation tooling.`;
} else {
  hotTakeaway = `Keyless adds **~${Math.round(overheadVsDotenvNs)} ns** per access on top of raw \`process.env\` — the cost of cache lookup, async boundary, and observability hooks. \`envalid\` and \`@t3-oss/env-core\` are faster (~${Math.round(overheadVsT3Ns)} ns delta) because they validate at startup and hand back a frozen plain object. The Keyless \`Promise\` boundary is what unlocks remote providers, refresh, and rotation.`;
}

const now = new Date().toISOString();

const report = `<!--
AUTO-GENERATED — do not edit by hand.
Run \`pnpm bench:report\` to refresh.
Last generated: ${now}
-->

# Benchmarks

Per-access cost of looking up a validated secret in a hot path, measured with
[tinybench](https://github.com/tinylibs/tinybench). Each benchmark runs for
~1s of measurement time after warmup. Numbers are operations per second
(higher is better) and nanoseconds per operation (lower is better).

> **Caveat:** Keyless returns a \`Promise\` for every access because it has to
> support remote providers (GCP/AWS/Azure/Vault), automatic refresh, and
> per-key TTL. \`envalid\` and \`@t3-oss/env-core\` validate at startup and
> hand back a frozen object — subsequent access is a plain property read,
> which is naturally faster. The numbers below are honest, not flattering.

## Per-secret access (hot path)

${chartBlock("Per-secret access — ops/sec, higher is better", compResults)}

${tableBlock(compResults)}

**Takeaway:** ${hotTakeaway}

For HTTP request hot paths (typically thousands of accesses per second), the
delta is imperceptible — sub-microsecond per secret regardless of which tool
you pick.

## Internal paths

How Keyless behaves on its own cache vs cold-fetch paths.

${chartBlock("Internal paths — ops/sec, higher is better", internalResults)}

${tableBlock(internalResults)}

**Takeaway:** First fetch (cache miss) pays for schema validation and
provider iteration. Subsequent calls hit the cache and run ~${
  internalResults[0] && internalResults[1]
    ? Math.round(internalResults[0].hz / internalResults[1].hz)
    : "?"
}× faster.

---

### How to reproduce

\`\`\`bash
pnpm install
pnpm bench:report
\`\`\`

Numbers will vary by machine. The benchmarks live in
[\`scripts/bench-report.ts\`](./scripts/bench-report.ts).
`;

const outPath = resolve(process.cwd(), "BENCHMARKS.md");
await writeFile(outPath, report, "utf8");
console.log(`Wrote ${outPath}`);
