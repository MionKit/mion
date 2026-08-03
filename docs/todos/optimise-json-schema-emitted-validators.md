---
type: chore
spec: guidelines
status: ready
created: 2026-08-03
---

# Optimise the emitted validators for JSON Schema documents

## Intent

The JSON Schema door emits correct validators, but on a few keywords the generated code
does obvious per-call work that the rest of the codebase already knows how to avoid. On
`closed_object`, `pattern_properties` and `unique_items` we are last or near-last of the
four competitors that can express the case, by up to 3.6x.

Baseline from `.docdata/benchmarks/` (2026-08-03), **valid / invalid ops/sec**, the pair the
benchmark page shows. Bold marks where we are beaten:

**validate**

| case | ts-runtypes | typebox | ajv | typia |
|---|---|---|---|---|
| `closed_object` | **24.7M / 54.6M** | 38.0M / 72.2M | 31.9M / 38.4M | 35.6M / 51.2M |
| `pattern_properties` | **8.0M / 12.5M** | 12.1M / 15.9M | 16.0M / 17.5M | 13.5M / 18.8M |
| `unique_items` | **9.0M / 12.8M** | 922k / 1.3M | 20.4M / 14.4M | 32.4M / 26.0M |
| `property_names` | 18.3M / 31.8M | n/a | 20.2M / 17.1M | n/a |
| `object_size` | 23.7M / 39.8M | 13.3M / 40.2M | 22.9M / 20.4M | n/a |
| `contains_count` | 44.3M / 80.9M | 47.5M / 79.8M | 24.0M / 27.3M | n/a |
| `dependent_required` | 35.5M / 50.2M | n/a | 35.7M / 32.7M | 31.3M / 62.8M |
| `string_email` | 18.7M / 28.4M | 19.4M / 39.1M | 16.3M / 22.6M | 19.0M / 33.3M |
| `int_bounded` | 91.5M / 110M | 91.9M / 111M | 40.4M / 36.6M | 85.0M / 106M |
| `string_pattern` | 33.9M / 56.3M | 34.4M / 57.0M | 25.7M / 30.9M | 12.2M / 19.3M |
| `multiple_of` | 67.8M / 97.0M | 70.5M / 101M | 42.9M / 20.3M | 68.1M / 93.2M |

**getValidationErrors** (same emitters, so most fixes should carry across)

| case | ts-runtypes | ajv | typia |
|---|---|---|---|
| `closed_object` | **15.1M / 16.4M** | 27.5M / 30.1M | 34.9M / 5.8M |
| `pattern_properties` | **8.0M / 8.8M** | 15.7M / 14.7M | 13.5M / 4.2M |
| `unique_items` | **8.8M / 7.4M** | 20.1M / 13.4M | 31.2M / 8.0M |
| `contains_count` | **16.2M / 16.7M** | 22.4M / 19.1M | n/a |
| `string_email` | 14.8M / 17.6M | 16.5M / 22.5M | 18.2M / 8.1M |
| `property_names` | 17.6M / 13.4M | 18.9M / 11.9M | n/a |
| `object_size` | 22.9M / 18.6M | 23.4M / 19.3M | n/a |
| `dependent_required` | 36.6M / 24.5M | 35.7M / 32.2M | 30.7M / 7.5M |
| `int_bounded` | 81.9M / 31.7M | 39.0M / 32.6M | 78.5M / 12.8M |
| `string_pattern` | 31.9M / 25.4M | 26.1M / 30.5M | 11.9M / 6.3M |
| `multiple_of` | 64.6M / 30.5M | 43.2M / 21.2M | 63.2M / 11.5M |

Priority: **`closed_object`, `pattern_properties`, `unique_items`** on both lanes, then
`contains_count` and `string_email` on the errors lane only. The parity rows are fine;
leave them alone unless a shared fix carries them along. Secondary observation worth a
look: on the errors lane our invalid-input throughput often falls below our valid-input
throughput (`unique_items` 8.8 to 7.4, `int_bounded` 81.9 to 31.7) where ajv stays roughly
symmetric, so error construction on the failure path may be its own cost.

## Direction

**Method: read the emitted code first, every time.** The generated cache modules land as
plain `.js` under `packages/ts-runtypes/__runtypes/types/`. Add or find a call site in
`packages/ts-runtypes/test/suites/json-schema-define/`, build, and read what actually came
out before changing an emitter. Do not optimise from the Go source alone.

The cases live in [container/benchmarks/shared/cases/validation/JsonSchema.ts](../../container/benchmarks/shared/cases/validation/JsonSchema.ts)
(7) and [container/benchmarks/shared/cases/format-validation/JsonSchema.ts](../../container/benchmarks/shared/cases/format-validation/JsonSchema.ts)
(4). Re-baseline with `RT_BENCH_USE_LOCAL=1 pnpm rtx bench --website` before starting,
since these numbers move with the machine.

**Reuse what exists rather than inventing.** Three pieces of machinery are already here and
already tuned:

- **The `hasUnknownKeys` key-count fast path** —
  [unknownkeys_has.go:137-157](../../ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_has.go)
  replaces an O(props x keys) scan with a key-count compare when the shape is all-required
  and closed, measured at 3x on a 7-prop shape and ~44x at 30 props (`countFastPathN` /
  `emitCountKeysCheck`). `closed_object` is exactly that shape.
- **The factory-prologue hoist** — `ctx.SetContextItem`, used correctly by
  `emitPatternPropCheck` at
  [validate.go:409-411](../../ts-go-runtypes/internal/cachegen/typefunctions/validate.go)
  to compile a key regex once per factory.
- **Pure-fn registration** — `registerPureFnFactory` in
  [pure-fns-utils.ts:24](../../packages/ts-runtypes/src/runtypes/pure-fns-utils.ts), for a
  helper worth hoisting out of the emitted body entirely.

**Leads worth checking (verify them, do not trust them).** These came out of a read of the
emitters, not of the emitted output, so treat them as starting points:

- `closedKeyTest`
  ([objectformat.go:67-75](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/structural/objectformat.go))
  builds `new RegExp(...)` **inside** the per-key `.every()` callback, so a regex is
  compiled per key per call, and tests allowed keys with an array literal `.includes(k)`
  that is also re-created per key. Note `EmitValidateCheck` takes a `formats.EmitContext`
  and currently ignores it, so the hoist above is available but unused. This is the
  `closed_object` and `pattern_properties` path.
- `objectConditions`
  ([objectformat.go:96-108](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/structural/objectformat.go))
  can emit up to three independent `Object.keys(v)` allocations in one predicate
  (minProperties, maxProperties, closed).
- `uniqueItemsCheck`
  ([arrayformat.go:47-53](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/structural/arrayformat.go))
  re-defines its `canon` closure on every call and canonicalises every item to a string,
  even for an array of primitives. The comment says the self-contained IIFE was a
  deliberate choice; the numbers now argue the other way. A primitive-element
  specialisation looks safe under 2020-12 (SameValueZero already collides 0 with -0, and
  JSON cannot carry NaN) but must be proven, not assumed.
- `emitPatternPropCheck`
  ([validate.go:403-425](../../ts-go-runtypes/internal/cachegen/typefunctions/validate.go))
  walks `Object.keys(v)`, where `emitIndexSignatureHasUnknownKeys` uses `for (const k in v)`
  and allocates nothing. When `patternProperties` and `additionalProperties: false` appear
  together, as in the `pattern_properties` case, the keys get walked more than once.

Both structural emitters implement `EmitValidateCheck` **and**
`EmitValidationErrorsCheck`, so most fixes should land on both lanes. Check that they do.

Each case is its own investigation. Do not batch a single refactor across all of them.

## Done when

- The three priority cases are meaningfully faster on both lanes, and none of the eleven
  regressed. State the before and after numbers, using the valid / invalid pair.
- **Tests, despite the `chore` type.** Emitted-code changes need coverage: add or extend
  the relevant suites under `packages/ts-runtypes/test/suites/json-schema-define/`, plus
  `go -C ts-go-runtypes test ./internal/...` for the emitters. `pnpm test` green.
- Correctness did not move: `pnpm rtx bench spec` still reports **61/65** for ts-runtypes
  (the four known gaps are
  [json-schema-spec-conformance-gaps.md](json-schema-spec-conformance-gaps.md), not this
  todo's problem), and the Correctness alignment table gains no new misalignments.
- No docs change expected. The benchmark pages read their numbers from the results, so
  they update themselves.

## Out of scope

- The four conformance gaps in
  [json-schema-spec-conformance-gaps.md](json-schema-spec-conformance-gaps.md).
- Type-instantiation cost (the Compile-time page). Different axis, different fix.
- Any competitor-side or harness change.
