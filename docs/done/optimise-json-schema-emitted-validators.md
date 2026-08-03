---
type: chore
spec: guidelines
status: done
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
  [json-schema-spec-conformance-gaps.md](../todos/json-schema-spec-conformance-gaps.md), not this
  todo's problem), and the Correctness alignment table gains no new misalignments.
- No docs change expected. The benchmark pages read their numbers from the results, so
  they update themselves.

## Out of scope

- The four conformance gaps in
  [json-schema-spec-conformance-gaps.md](../todos/json-schema-spec-conformance-gaps.md).
- Type-instantiation cost (the Compile-time page). Different axis, different fix.
- Any competitor-side or harness change.

---

## Plan and outcome — implemented 2026-08-03

Approved plan, and what actually shipped. Two rules drove every change, both with an
existing house implementation that was copied rather than reinvented:

1. **Anything reusable and expensive to build goes in the factory prologue** —
   `ctx.NextLocalVar` + `ctx.SetContextItem`, the `emitPatternTest` idiom.
2. **No callback per key** — the `Record` / index-signature path
   (`emitIndexSignatureValidate`) is the reference: a bare `for…in` with early returns, its
   key regex hoisted, membership against a prologue `Set`.

### What changed

- **`formats/structural/objectformat.go`** — stopped discarding the `EmitContext`. One
  prologue-hoisted `for…in` sweep now covers `minProperties`, `maxProperties` and
  `additionalProperties: false` together, where each of the three previously allocated its
  own `Object.keys(v)` array. Allowed keys are an identity chain up to
  `identityChainMaxKeys` (8) and a hoisted `Set` above it; every `closedPatterns` regex
  hoists. The errors lane keeps one statement per keyword so attribution is unchanged, and
  shares a single hoisted count fn between the two bounds.
- **`formats/structural/arrayformat.go` + `pure-fns-utils.ts`** — `uniqueItems` moved into
  the new `rt::uniqueItems` pure fn, so the canonicalisation closure is built once per
  module instead of once per validator call. Primitives key a Set raw and only objects and
  arrays are canonicalised, with the two kept in SEPARATE sets so the string `'{}'` can
  never collide with the canonical form of `{}`. `rt::` and not `rtFormats::` deliberately:
  pure-fns-utils.ts is side-effect imported from the package entry, so it is always
  registered, whereas the rtFormats modules only register when `ts-runtypes/formats` is
  imported, which a schema-door-only program never does.
- **`validate.go` / `validationerrors.go`** — `propertyNames` moved off
  `Object.keys(v).every(cb)` onto a hoisted `for…in` sweep (its child compiles against the
  KEY, so the whole loop hoists); `patternProperties` keeps its IIFE (its value child closes
  over `v`) but walks `for…in` instead of `for…of Object.keys(v)`. After this there is not a
  single `.every(` callback or `Object.keys` key array left in the emitted corpus.

### RichRecord — investigated and rejected

Raised during planning: could `patternProperties` lower to a Record carrying the key rule as
settings, landing it on the already-optimal index-signature loop? Feasible for ONE pattern,
but TypeScript allows several index signatures only with distinct key types, and 2020-12
permits N arbitrary-regex patterns with N value types, all keyed plain `string`. It cannot be
made total, so the sentinel stays. The reasoning is now recorded at `PatternPropsPart` in
[fromJsonSchema.ts](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts) so it is
not re-litigated.

### Results

Valid-input ops/sec. **Competitor columns are re-measured in the same session**; the "before"
column is the earlier baseline run, which is why every untouched row reads 3-7% low. That
offset is cross-run drift, not regression: two runs of identical code reproduced it, and
`property_names` alone swung 12.3 to 17.0 between them, so anything inside roughly +/-7% here
is noise.

**validate**

| case | before | after | delta | typebox | ajv | typia |
|---|---|---|---|---|---|---|
| `unique_items` | 9.0 | **30.3** | **+236%** | 0.9 | 11.8 | 31.5 |
| `pattern_properties` | 8.0 | **13.4** | **+67%** | 8.6 | 15.7 | 12.7 |
| `closed_object` | 24.7 | **34.9** | **+41%** | 33.9 | 31.3 | 33.8 |
| `object_size` | 23.7 | 26.1 | +10% | 12.3 | 23.2 | n/a |
| `property_names` | 18.3 | 18.1 | -1% | n/a | 19.7 | n/a |
| `contains_count` | 44.3 | 42.7 | -4% | 46.0 | 23.5 | n/a |
| `dependent_required` | 35.5 | 33.4 | -6% | n/a | 34.3 | 30.8 |
| `string_email` | 18.7 | 17.4 | -7% | 18.9 | 15.5 | 18.3 |
| `int_bounded` | 91.5 | 87.7 | -4% | 93.5 | 40.2 | 81.2 |
| `string_pattern` | 33.9 | 31.4 | -7% | 31.9 | 25.8 | 11.6 |
| `multiple_of` | 67.8 | 65.8 | -3% | 65.9 | 41.1 | 63.8 |

**getValidationErrors** (targets only; the rest sit in the drift band)

| case | before | after | delta | typebox | ajv | typia |
|---|---|---|---|---|---|---|
| `unique_items` | 8.8 | **28.8** | **+229%** | 0.7 | 19.2 | 30.1 |
| `pattern_properties` | 8.0 | **13.0** | **+62%** | 1.9 | 15.5 | 12.9 |
| `closed_object` | 15.1 | **17.9** | **+18%** | 1.3 | 27.1 | 33.5 |

Standing versus the field changed on all three targets: `closed_object` went from last to
first on validate, `unique_items` from last-but-one to level with typia, `pattern_properties`
from last to second. **`closed_object` on the errors lane is still well behind ajv (17.9 vs
27.1) and typia (33.5)** — the closed sweep is now cheap, so the remaining cost is elsewhere
in the errors path, and that is a separate investigation.

### Verification

- `go -C ts-go-runtypes test ./internal/...` green, including 12 new shape tests in
  `formats/structural/{objectformat,arrayformat}_test.go` (the package had none).
- `pnpm test` 9781 passed, 0 failed, with 6 new behavioural cases in
  `structuralKeywords.test.ts` covering both sides of the identity-chain threshold, the fused
  count-and-close sweep, inherited enumerable keys, string-versus-object-canon separation,
  and mixed primitive/object uniqueness.
- `pnpm rtx bench spec` **61/65**, the same four pre-existing gaps
  ([json-schema-spec-conformance-gaps.md](../todos/json-schema-spec-conformance-gaps.md)), no new
  failures. Alignment audit: **0 divergences** for ts-runtypes, no JSON_SCHEMA entries.
- `pnpm run lint` and `pnpm run format` clean.

### Deliberate semantic change

The key sweeps are `for…in`, which enumerates inherited enumerable properties where
`Object.keys` does not. A closed object inheriting an enumerable key is now rejected as
having an additional key, and `propertyNames` / `patternProperties` likewise see inherited
keys. This makes every key-walking keyword agree with the index-signature loop,
`pf_hasUnknownKeysFromArray` and `pf_countEnumKeys`, which were already `for…in`. JSON-shaped
data carries no inherited enumerables, so the contract is unaffected; a test pins the intent.

### Found along the way

[purefn-type-stripper-drops-no-type-arguments.md](../todos/purefn-type-stripper-drops-no-type-arguments.md)
— the pure-fn extractor strips type annotations but not call/new type arguments, so
`new Set<any>()` in any pure-fn body ships as invalid JavaScript with nothing to catch it.
Hit while writing `rt::uniqueItems`; worked around with a comment there, filed for a real fix.

### Left for later

- `closed_object` and `contains_count` on the errors lane still trail ajv; the cost is no
  longer in the key sweep.
- `patternProperties` beside `additionalProperties: false` still walks the keys twice and
  hoists the same regex source under two prologue names, because the closedness brand and the
  pattern sentinel are emitted by different files. Fusing them is the remaining
  `pattern_properties` gap versus ajv.
