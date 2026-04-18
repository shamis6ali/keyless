<!--
AUTO-GENERATED — do not edit by hand.
Run `pnpm bench:report` to refresh.
Last generated: 2026-04-18T08:10:10.431Z
-->

# Benchmarks

Per-access cost of looking up a validated secret in a hot path, measured with
[tinybench](https://github.com/tinylibs/tinybench). Each benchmark runs for
~1s of measurement time after warmup. Numbers are operations per second
(higher is better) and nanoseconds per operation (lower is better).

> **Caveat:** Keyless returns a `Promise` for every access because it has to
> support remote providers (GCP/AWS/Azure/Vault), automatic refresh, and
> per-key TTL. `envalid` and `@t3-oss/env-core` validate at startup and
> hand back a frozen object — subsequent access is a plain property read,
> which is naturally faster. The numbers below are honest, not flattering.

## Per-secret access (hot path)

```mermaid
xychart-beta
    title "Per-secret access — ops/sec, higher is better"
    x-axis ["keyless (cache hit)", "dotenv (process.env)", "envalid", "t3-env"]
    y-axis "Operations per second" 0 --> 22000000
    bar [6637031, 4266585, 12869453, 19365579]
```

| Library | ops/sec | ns/op | Relative |
| --- | ---: | ---: | ---: |
| keyless (cache hit) | 6.64M | 150.7 | 34.3% |
| dotenv (process.env) | 4.27M | 234.4 | 22.0% |
| envalid | 12.87M | 77.7 | 66.5% |
| t3-env | 19.37M | 51.6 | 100.0% |

**Takeaway:** Keyless cache-hit access is **~84 ns faster** than raw `process.env` here — Node's `process.env` is a getter-backed object that does string coercion on each read, so a hot in-process cache can actually beat it. Compared to startup-validated tools like `envalid` and `@t3-oss/env-core` (frozen plain objects, sync property reads), Keyless pays **~99 ns** extra per access. That's the cost of the `Promise` boundary plus cache lookup — in exchange for provider fallthrough, automatic refresh, and rotation tooling.

For HTTP request hot paths (typically thousands of accesses per second), the
delta is imperceptible — sub-microsecond per secret regardless of which tool
you pick.

## Internal paths

How Keyless behaves on its own cache vs cold-fetch paths.

```mermaid
xychart-beta
    title "Internal paths — ops/sec, higher is better"
    x-axis ["cache hit", "cache miss (1 provider)", "cache miss (3-provider fallthrough)"]
    y-axis "Operations per second" 0 --> 8000000
    bar [7072828, 334071, 258132]
```

| Library | ops/sec | ns/op | Relative |
| --- | ---: | ---: | ---: |
| cache hit | 7.07M | 141.4 | 100.0% |
| cache miss (1 provider) | 334.1K | 2993.4 | 4.7% |
| cache miss (3-provider fallthrough) | 258.1K | 3874.0 | 3.6% |

**Takeaway:** First fetch (cache miss) pays for schema validation and
provider iteration. Subsequent calls hit the cache and run ~21× faster.

---

### How to reproduce

```bash
pnpm install
pnpm bench:report
```

Numbers will vary by machine. The benchmarks live in
[`scripts/bench-report.ts`](./scripts/bench-report.ts).
