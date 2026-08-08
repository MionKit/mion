# Fuzzing & hardening

Autonomous, reproducible fuzzing of the runtime validation/serialization
functions. The harness reuses the reflection graph the library already builds:
because every `RunType` is walkable at runtime, the same giant-switch design as
the mock walker drives both _valid_ and _invalid_ data generation, and a small
oracle layer decides when a function misbehaves.

> Status: **Phase 1 (data fuzzing) AND Phase 2 (random type generation)
> implemented.** Phase 1 fuzzes values against a fixed set of types; Phase 2
> fuzzes the types themselves. See [Phase 2](#phase-2--random-typescript-type-generation-implemented).

## Why it exists

The validate/serialize functions are exercised by ~3k example-based suite
tests, but those use small, hand-written values. Fuzzing feeds _thousands_ of
randomized values per type into every function and checks invariants that must
hold for **all** inputs. The first run already found and fixed a real bug — see
[Findings](#findings).

## Layout

All under [`packages/ts-runtypes/test/fuzz/`](../packages/ts-runtypes/test/fuzz/):

| File | Role |
| ---- | ---- |
| `core/seededRng.ts` | Deterministic PRNG (`mulberry32`) + `withSeededRandom(seed, fn)` — scopes a seeded `Math.random` so a whole run replays from one number. |
| `core/typeGen.ts` | The THIRD giant switch — a seeded generator of random types across the WIDEST space (classes, functions, symbols, index sigs, native builtins, intersections, circular interfaces, any/unknown/never/void, format leaves) + named decls + a renderer to `.ts`. |
| `core/runTypeGen.ts` | Seeded generator of `RunType` graphs directly, for the offline lanes that need a schema without compiling a type. |
| `core/srcOverlay.ts` | The REAL `src/` tree as a resolver overlay, so a fixture imports the shipped declarations instead of a stand-in. |
| `core/soakBudget.ts` | The soak wall clock: refuses to start an iteration the remaining budget cannot pay for, and sizes each soak test's vitest timeout. |
| `value/invalidValue.ts` | The metamorphic **giant switch** — the inverse of `mockType.ts`. Per-kind wrong-value generation + the tandem tree walk that corrupts one provably-invalid position. |
| `value/shapeValue.ts` | Type→value: a conforming value for the serialisable subset, a strict `valueOracleSafe` gate, and a sound one-position corruption (mirrors invalidValue.ts's contract). |
| `value/fuzzOracle.ts` | The value oracle layer: the `FuzzTarget` shape and the O1–O7 / O12 checks. (The TR1–TR4 resolver/emit checks live in `type/typeFuzzRunner.ts`; this file only declares their ids.) |
| `value/fuzzRunner.ts` | The Phase-1 driver: `runFuzz` (fixed iterations) and `runFuzzForDuration` (autonomous soak). Type-blind junk generator. |
| `value/fuzz.integration.test.ts` | Phase-1 end-to-end sweep over REAL compiled functions (needs the plugin + binary). |
| `type/typeFuzzHarness.ts` | Drives generated source through the resolver (`serve --sources ops`) → entry modules → REAL runtime factories; records diagnostics + per-factory wire outcome. |
| `type/typeFuzzRunner.ts` | The Phase-2 driver: `runTypeFuzz` / `runTypeFuzzForDuration` — owns the resolver (restarts it on a hang), Tier-A (resolver/emit) on every type + Tier-B (value/robustness) per type. Hosts TR1–TR4 and the non-data O10 / O12 / O14 checks. |
| `type/typeFuzz.integration.test.ts` | Phase-2 end-to-end sweep over generated TYPES, values from `shapeValue.ts` (needs the binary). |
| `type/nonDataTypeFuzz.integration.test.ts` | The DataOnly non-data lane: same driver, values from the REAL `createMockDataFn`, serialize-or-fail contract. |
| `type/mockSeedFuzz.ts`, `type/tsValidate.ts` | The mock-determinism driver, and the in-process TypeScript validity gate that filters false positives on non-compilable generated types. |
| `type/*.smoke.test.ts`, `type/bugReprosValidTs.test.ts` | Pinned minimal repros for findings already fixed. |
| `jsonschema/schemaRender.ts` + `jsonSchemaFuzz.integration.test.ts` | The json-schema lane: normalize a generated type to the expressible subset, render it as draft 2020-12, and assert the type-first spelling and `FromJsonSchema<S>` resolve to ONE structural id. The format-leaf roster covers EVERY format feature (all 19 `format:` keyword rows, both content keywords, param constraints) and the type-first side IMPORTS the shipped brands (`TF.*` via the fixture preamble + the src overlay) — nothing is restated, so brand/door drift fails loudly as an id divergence at the exact leaf (see the COVERAGE / NO DUPLICATION rules on `FormatLeafName` in `core/typeGen.ts`). Per-keyword convergence is also enumerated (`schemaFormatKeywordConvergence.test.ts`, the id-integrity catalog driver); this lane adds arbitrary-depth composition. |
| `roundtrip/roundtripOracle.ts` + `roundtripRunner.ts` | The all-strategy round-trip lane (`RT-*` oracles): every codec strategy for one generated serialisable type. |
| `binary/sizeOracle.ts` + `sizeFuzzRunner.ts` | The binary size-estimate lane (`O-SIZE-*`): in-bounds values must not resize the cold buffer, oversized ones must. |
| `binary/binaryEncoderResize.test.ts` | Pinned regression for the first finding. |
| `cloning/referenceClone.ts` | The clone ORACLE MODEL — a naive reference interpreter of `createCloneExactShapeFn<T>` over the reflected RunType graph; what the compiled clone is compared against (O15). |
| `cloning/extrasValue.ts` | The extras mutator — injects undeclared `__fz_extra_<n>` keys at provably-sound plain-object positions (validate stays true, a correct clone must strip them). Same one-directional soundness contract as `invalidValue.ts`. |
| `cloning/cloneOracle.ts` | The cloning oracle layer: `CloneFuzzTarget` + the O15–O17 checks, a local Temporal-aware `deepEqual`, and the shared-mutable-reference walker. |
| `cloning/cloneFuzzRunner.ts` | The cloning driver: `runCloneFuzz` / `runCloneFuzzForDuration` — valid / extras / junk streams per seed. |
| `cloning/cloneFuzz.integration.test.ts` | The cloning end-to-end sweep over REAL compiled `createCloneExactShapeFn` factories, plus the CES001 throw-corpus and the cyclic-value pin. |
| `enrich/enrichModel.ts`, `i18nModel.ts`, `typeModFuzzRunner.ts` | The model-based enrichment lanes: random command sequences against the real CLI, checked by the `R*` / `T*` / `NL RC CB P` rule sets. |
| `**/*.unit.test.ts` | Offline unit tests (no Go binary) over hand-built `RunType` graphs + the generator / value / budget layers. |

## Data generation — three streams

Everything draws from a seeded `Math.random`, so each iteration is reproducible
from its `seed`.

1. **Valid** — `createMockDataFn<T>()`. Valid by construction; the strong oracles
   expect acceptance / round-trip equality.
2. **Invalid** — `mutateToInvalid(schema, validMock)`. Takes a valid mock and
   corrupts exactly one position to a wrong type. Invalid by construction; the
   oracle expects rejection.
3. **Junk** — `randomJunk()`. Type-blind random values (bounded depth, acyclic).
   Validity is unknown, so only the robustness/consistency oracles apply.

### The giant switch (`invalidForKind`)

Mirrors `mockSwitch` in `mockType.ts`: one `case` per `RunTypeKind`. What counts
as "wrong" depends entirely on the node, so each case returns a value of a
**disjoint** type (a `'123'` string for `number` probes loose coercion) plus a
`proven` flag.

`proven` is `false` exactly where a value _can't_ be shown invalid in isolation:
`any` / `unknown` (accept everything) and bare `union` (a sibling branch may
re-accept). Those are never used as corruption sites.

### Soundness contract (one-directional)

> When `mutateToInvalid` returns a value, `validate<T>` on it MUST be `false`.

The tandem walker is deliberately conservative — it never descends through
`union`, `any`, `unknown`, index signatures, or Map/Set internals, where a
sibling or catch-all could re-accept the corruption. A false **negative**
(returning `null` when a deeper mutation was possible) only costs coverage; a
false **positive** would produce a spurious oracle failure. Same shape as the
noop-predicate contract in the serializer.

## The oracle layer

Fuzzing is only as good as its oracle. We derive invariants from properties the
library must uphold, never from hand-written expected outputs:

| Id     | Class       | Invariant                                                     |
| ------ | ----------- | ------------------------------------------------------------- |
| **O1** | strong      | `validate(mock)` is `true`                                    |
| **O2** | strong      | `validate(corrupted-mock)` is `false`                         |
| **O3** | robustness  | `validate(anything)` returns a boolean, never throws          |
| **O4** | consistency | `validate(x)` ⇔ `getValidationErrors(x).length === 0`         |
| **O5** | strong      | JSON wire is stable: `encode(decode(encode v)) === encode(v)` |
| **O6** | strong      | binary wire is byte-stable through `decode∘encode`            |
| **O7** | robustness  | `encode(valid)` does not throw and yields a wire value        |
| **O10** | consistency | a type whose encoders ALL `alwaysThrow` carries an Error-severity diagnostic (fail ⇒ error) |
| **O12** | consistency | the two wires agree on the value: `jsonEncode(binaryDecode(binaryEncode v))` equals `jsonEncode(v)` |
| **O14** | consistency | JSON and binary agree on serialize-vs-`alwaysThrow` — the rule is the same for every serialization family |
| **O15** | strong      | `clone(v)` deep-equals `referenceClone(schema, v)`           |
| **O16** | strong      | clone never mutates its input, shares no mutable reference with it, and keeps the root prototype |
| **O17** | consistency | `validate(clone(v))` is true, `clone∘clone` is stable, and extras-injected inputs come out `hasUnknownKeys`-clean |

O10 / O12 / O14 are the non-data lane's additions
([`type/typeFuzzRunner.ts`](../packages/ts-runtypes/test/fuzz/type/typeFuzzRunner.ts)),
where values come from the REAL `createMockDataFn` and the serialize-vs-fail
tier is read off the ACTUAL encoder behaviour.

Four more lanes carry their own catalogues, on the same principle:

| Ids | Lane | Where |
| --- | --- | --- |
| **RT-VALIDATE / RT-AGREE / RT-STABLE / RT-FAILAGREE / RT-NATIVE / RT-THROW** | all-strategy round-trip: every codec strategy for one generated type agrees | [`roundtrip/roundtripOracle.ts`](../packages/ts-runtypes/test/fuzz/roundtrip/roundtripOracle.ts) |
| **O-SIZE-ROUNDTRIP / O-SIZE-GREW** | binary size estimate: an in-bounds value must not resize the cold buffer, an oversized one must | [`binary/sizeOracle.ts`](../packages/ts-runtypes/test/fuzz/binary/sizeOracle.ts) |
| **R1 R2 R3 R5 R6 R7a R8 R10** | enrichment sync: idempotence, preservation, convergence, orphan carcasses, prune, totality | [`enrich/enrichModel.ts`](../packages/ts-runtypes/test/fuzz/enrich/enrichModel.ts) |
| **T1–T7, T10** / **NL RC CB P** | i18n reconcile / type-modification: never-copy, arms-owned, kind-stable, todo discipline / nothing-lost, rename-carry, content-blindness, parse-safety | [`enrich/i18nModel.ts`](../packages/ts-runtypes/test/fuzz/enrich/i18nModel.ts), [`enrich/typeModFuzzRunner.ts`](../packages/ts-runtypes/test/fuzz/enrich/typeModFuzzRunner.ts) |

Those four ride a `rule:` field rather than `oracle:`, so grepping for `oracle:`
alone will not find them.

O5/O6 compare the **wire image** (`encode∘decode∘encode === encode`) rather than
value equality, which sidesteps the optional-`undefined`-key vs dropped-key
mismatch the mock produces. O4 is a cheap, powerful cross-check: the two
validation functions disagreeing is almost always a bug.

### The cloning oracles — a reference interpreter as the model

`createCloneExactShapeFn<T>()` has no wire to round-trip, so its strong oracle
is a **model**: [`cloning/referenceClone.ts`](../packages/ts-runtypes/test/fuzz/cloning/referenceClone.ts)
is a naive, obviously-correct interpreter of the clone contract over the same
reflected RunType graph the mock walker reads — declared members rebuild,
undeclared keys drop, opaque values (functions, symbols, promises,
non-serializable handles) pass by reference, Date/RegExp/Map/Set/Temporal
re-materialize, class instances keep their prototype. O15 asserts the
compiled clone and the interpreter agree on every conforming value; when they
diverge, one of them is wrong and the interpreter is short enough to eyeball.

The value streams add a fourth flavour next to valid/invalid/junk: the
**extras** stream ([`cloning/extrasValue.ts`](../packages/ts-runtypes/test/fuzz/cloning/extrasValue.ts))
deep-copies a valid mock and injects `__fz_extra_<n>` keys at plain-object
positions where the injection provably keeps `validate` true AND a correct
clone must strip it — the same conservative, one-directional soundness
contract as `mutateToInvalid` (the walker never descends unions, Map/Set
internals, or index-signature objects). O17 then checks the clone comes out
`hasUnknownKeys`-clean.

Two contract edges ride along as pinned tests rather than fuzz streams:
object-bearing unions are a **throw-corpus** (the factory must be a CES001
alwaysThrow — there is no sound way to pick which declared shape to rebuild),
and a cyclic VALUE is pinned to its accepted failure mode (RangeError stack
overflow — values are trees by contract; there is deliberately no cycle
detection). Circular TYPES fuzz normally with tree-shaped mock values. The
one corpus exclusion is template-literal-keyed index signatures: the compiled
sig arm gates keys behind the pattern regex, which the reference interpreter
does not model yet — teaching it the same regex builder is the natural
follow-up.

## Running

All suites run through the internal CLI: `pnpm rtx core fuzz <suite> [--soak]`. It
builds the binary + plugin first (except `unit`, which needs neither) and sets the
suite's `RT_FUZZ_*` env for you. Suites: `unit | value | types | nondata |
roundtrip | size | jsonschema | cloning | enrich | i18n | typemod | race |
sidecar | patterngen | all`.

A `--soak` run is bounded by its own wall clock: the runner refuses to start an
iteration the remaining budget cannot pay for
([`core/soakBudget.ts`](../packages/ts-runtypes/test/fuzz/core/soakBudget.ts)),
and every soak test sizes its vitest timeout with `soakTestTimeout(soakMs)` from
the same module. Before that, the runners only bounded when an iteration could
START, so a compile-bound lane overshot its budget and vitest reported a CLEAN
soak as a timeout failure.

```bash
# offline unit tests — pure logic, no Go binary needed
pnpm rtx core fuzz unit

# end-to-end sweep over compiled functions (builds binary + plugin first)
pnpm rtx core fuzz all

# autonomous soak: fuzz for 60s, log every finding (set RT_FUZZ_SEED to replay)
pnpm rtx core fuzz value --soak

# Phase 2 — generate random TYPES and sweep both oracle tiers (builds binary first)
pnpm rtx core fuzz types

# Phase 2 autonomous soak (set RT_FUZZ_SEED to replay)
pnpm rtx core fuzz types --soak
```

Reproducing a reported violation: every `Violation` carries the `seed` that
produced it. `withSeededRandom(seed, …)` (or `runFuzz(targets, {seed})`) replays
the exact same data.

Adding a target: in `value/fuzz.integration.test.ts`, build a concretely-typed
`const schema = RT.…` and wire the `createX(schema)` factories into a
`FuzzTarget`. The plugin resolves each `createX` **statically from its argument
type**, so the schema must be a concrete `const` — never a generic `RunType`
parameter passed through a helper (that injects the `unknown` runtype). The
cloning corpus shows the other supported spelling: a type argument
(`createCloneExactShapeFn<T>()` + `getRunType<T>()`), which needs no `const` at
all and is the more common form now.

## Findings

- **Binary encoder buffer overflow on valid data** (fixed). `createBinaryEncoderFn`
  owns its serializer and sizes it from adaptive history (`predictBufferSize`).
  After many small encodes the prediction converged down toward the running
  mean, so an above-average string overflowed the buffer and threw
  `RangeError: buffer too small … Call resize() and retry.` instead of growing.
  Fixed in two steps: the serializer's writers now GROW IN PLACE (no throw, no
  re-encode) and the size predictor moved from a mean-EMA to Welford
  mean + k·σ. Pinned by `binaryEncoderResize.test.ts`.
- **Negated pattern-formats mocked unsoundly** (fixed). The mock walker's
  negation rejection sampling tested `url` / `domain` with a loose stand-in
  instead of their params, so `new URL()` rejected the relative references
  `UriReference` / `IriReference` exist to accept and the loose domain test
  demanded a dot a single-label `Hostname` does not have — an UNDER-match, the
  one direction that ships a value `validate` rejects. Pattern-bearing named
  formats now test their params, which is exactly what they compile to. Pinned
  by `test/features/negatedFormatMockSoundness.test.ts`.

Findings large enough to need their own spec are filed under
[`docs/todos/`](todos/) rather than listed here.

## Phase 2 — random TypeScript type generation (implemented)

Phase 1 fuzzes _values_ against a fixed set of types. Phase 2 fuzzes the _types_
themselves: it generates random but valid TypeScript source (the THIRD giant
switch — type declarations + `createX<T>()` call sites), runs the whole pipeline
(Go resolver → plugin → runtime), and checks both the resolver/emit behaviour
and the same value oracles, catching resolver/emitter bugs hand-written fixtures
miss.

### The third giant switch — the widest space we can throw

[`typeGen.ts`](../packages/ts-runtypes/test/fuzz/core/typeGen.ts) generates a
`GeneratedType` = `{decls, root}` (named declarations + a root type) seeded from
`Math.random`, then renders it to real `.ts`. The point is to stress the
pipeline with **arbitrary weird types**, not just clean DTOs:

- scalars + literals + `Date` / `RegExp` / `bigint`,
- arrays, tuples, objects (optional / `readonly` / **method** / non-identifier
  keys), **index signatures** + `Record<…>`, unions, **intersections**,
- native builtins **`Map`** / **`Set`** / **`Promise`**,
- non-serialisable kinds — **`function`**, **`symbol`**, **`any`** / `unknown` /
  `never` / `void` / `undefined`,
- named declarations — **`interface`** (incl. **recursive / circular**),
  **`declare class`** (with methods), **`enum`** (string- or auto-numbered).

Whether a type is serialisable is **not** a generation concern: the generator
emits anything that type-checks, and the oracle tier is chosen per type at run
time. The behaviour the fuzzer asserts is the **documented contract** — a
non-serialisable type is _supposed_ to emit Error-severity diagnostics and
degrade its factories to `alwaysThrow`; that's the contract working, not a bug.

### Two oracle tiers, chosen from the resolver's own signals

[`typeFuzzRunner.ts`](../packages/ts-runtypes/test/fuzz/type/typeFuzzRunner.ts)
checks, per generated type:

| Tier  | Id      | Applies to       | Invariant                                                                                                                 |
| ----- | ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **A** | **TR1** | every type       | resolver doesn't crash / hang (a per-type timeout restarts a wedged resolver and flags it)                                |
| **A** | **TR2** | every type       | every `createX<T>()` resolved to a site (6 fn + 1 reflection)                                                             |
| **A** | **TR3** | every type       | every emitted module is valid JS (evaluates) + the reflection graph knots (no dangling ref)                               |
| **A** | **TR4** | every type       | each factory either wires OR throws a **controlled** `[CODE]` alwaysThrow (an _uncontrolled_ wire failure is the bug)     |
| **B** | O1–O7   | serialisable     | the Phase-1 value oracles hold (valid accepted, corruption rejected, JSON/binary wire-stable, junk total)                 |
| **B** | O3/O4'  | non-serialisable | robustness probe: `validate` / `getValidationErrors` return sanely or throw an **Error** — never a non-Error, never crash |
| **B** | O7/O10/O12/O14 | non-data lane | the DataOnly serialize-or-fail contract (see below) |

Tier A (every type) catches resolver panics, hangs, malformed emit (invalid JS),
and dangling refs — the highest-value bugs. Tier B routes by a strict
`valueOracleSafe` gate: types whose value-generation provably matches the
validator get the full strong oracles (reusing the Phase-1 `fuzzOracle.ts` checks
verbatim); everything else gets the robustness probe. The value streams come
straight from the abstract type (`validValue` / `corruptValue` in
[`shapeValue.ts`](../packages/ts-runtypes/test/fuzz/value/shapeValue.ts)), so no
dependency on `createMockDataFn`.

That holds for the WILD lane (`valueSource: 'shape'`, the default). The DataOnly
non-data lane sets `valueSource: 'mock'` and draws from the REAL
`createMockDataFn` with `nonDataTypes` on instead — and there the
serialize-vs-fail tier is read from the ACTUAL encoder behaviour, not from the
resolver's diagnostics: the resolver over-reports Error severity for
non-serialisable positions inside DROPPED subtrees, so a type can carry an Error
and still serialize. The encoder either works or `alwaysThrow`s; that is the
ground truth O10 / O14 are checked against.

The harness ([`typeFuzzHarness.ts`](../packages/ts-runtypes/test/fuzz/type/typeFuzzHarness.ts))
reuses the vite-plugin test helpers
([`helpers/inline.ts`](../packages/ts-runtypes-devtools/test/helpers/inline.ts)):
render the fixture → `serve --sources ops` `ResolverClient.setSources` (atop the
`RUNTYPES_DTS` ambient overlay — a tiny inferred Program, no node_modules) →
`scanFiles` → `evalEntryModules` executes the emitted virtual modules into their
tuples → each fn tuple is passed as the injected id to the REAL factory
(`createValidateFn(undefined, undefined, tuple)` → `initFromTuple` links the whole
dependency closure into the live `rtUtils`, exactly as a rewritten call site
would). Each iteration seeds the type AND its value stream from one number, so a
reported violation replays exactly.

### Known limitations

- **Recursive types run Tier A only** (in the type lanes — the cloning lane DOES
  fuzz circular types end-to-end with tree-shaped mock values, see above).** The in-process `evalEntryModules` linker
  can't materialise a cyclic function graph the way Vite's real module graph
  does (it recurses depth-first and overflows), so recursive types are policed
  by the resolver/emit oracles (TR1–TR3) and **not** executed in-process — their
  runtime is covered by the real
  [`serialization/CircularRefs.test.ts`](../packages/ts-runtypes/test/suites/serialization/CircularRefs.test.ts)
  suite.
- **The strong value oracles cover a conservative subset.** `valueOracleSafe`
  deliberately excludes `any` / `unknown`, primitive-bearing intersections
  (which collapse to a branded primitive), class refs, and anything else whose
  value-gen can't provably match the validator — those are robustness-probed
  instead. Widening the subset means teaching `shapeValue.ts` the exact
  validator semantics for each kind.
- The live `rtUtils` registry accumulates across a long soak (every distinct
  type registers its closure once). Per-iteration cost stays stationary now
  that `findRTForType` is memoized (it used to scan the whole registry once
  per format-annotated mock node, which turned one iteration into 300+
  seconds — see docs/done/soak-single-iteration-pathology.md), and every soak
  fails loudly with a replayable round if a future iteration exceeds
  `SOAK_ITERATION_CEILING_MS`.
- Not yet generated: generics / conditional / mapped types, template-literal
  types. Each is a natural new arm of `typeGen.ts`. (Branded `TypeFormat`
  primitives ARE generated now — the `FormatLeafName` roster in every lane's
  leaf pool, plus the structural decorations behind
  `GenOptions.structuralFormats`, which only the json-schema lane turns on.)
