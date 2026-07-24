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

| File                           | Role                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seededRng.ts`                 | Deterministic PRNG (`mulberry32`) + `withSeededRandom(seed, fn)` — scopes a seeded `Math.random` so a whole run replays from one number.                                                                                                        |
| `invalidValue.ts`              | The metamorphic **giant switch** — the inverse of `mockType.ts`. Per-kind wrong-value generation + the tandem tree walk that corrupts one provably-invalid position.                                                                            |
| `fuzzOracle.ts`                | The oracle layer: `FuzzTarget` shape + the O1–O7 (value) and TR1–TR4 (resolver/emit) invariant checks.                                                                                                                                          |
| `fuzzRunner.ts`                | The Phase-1 driver: `runFuzz` (fixed iterations) and `runFuzzForDuration` (autonomous soak). Type-blind junk generator.                                                                                                                         |
| `*.unit.test.ts`               | Offline unit tests (no Go binary) over hand-built `RunType` graphs + the Phase-2 generator/value layers.                                                                                                                                        |
| `fuzz.integration.test.ts`     | Phase-1 end-to-end sweep over REAL compiled functions (needs the plugin + binary).                                                                                                                                                              |
| `binaryEncoderResize.test.ts`  | Pinned regression for the first finding.                                                                                                                                                                                                        |
| `cloning/referenceClone.ts`    | The clone ORACLE MODEL — a naive reference interpreter of `createCloneExactShapeFn<T>` over the reflected RunType graph; what the compiled clone is compared against (O15).                                                                       |
| `cloning/extrasValue.ts`       | The extras mutator — injects undeclared `__fz_extra_<n>` keys at provably-sound plain-object positions (validate stays true, a correct clone must strip them). Same one-directional soundness contract as `invalidValue.ts`.                    |
| `cloning/cloneOracle.ts`       | The cloning oracle layer: `CloneFuzzTarget` + the O15–O17 checks, a local Temporal-aware `deepEqual`, and the shared-mutable-reference walker (ported from `test/util/cloningAsserts.ts`).                                                     |
| `cloning/cloneFuzzRunner.ts`   | The cloning driver: `runCloneFuzz` / `runCloneFuzzForDuration` — valid / extras / junk streams per seed.                                                                                                                                        |
| `cloning/cloneFuzz.integration.test.ts` | The cloning end-to-end sweep over REAL compiled `createCloneExactShapeFn` factories, plus the CES001 throw-corpus and the cyclic-value pin (needs the plugin + binary).                                                                  |
| `typeGen.ts` _(Phase 2)_       | The THIRD giant switch — a seeded generator of random types across the WIDEST space (classes, functions, symbols, index sigs, native builtins, intersections, circular interfaces, any/unknown/never/void) + named decls + a renderer to `.ts`. |
| `shapeValue.ts` _(Phase 2)_    | Type→value: a conforming value for the serialisable subset, a strict `valueOracleSafe` gate, and a sound one-position corruption (mirrors invalidValue.ts's contract).                                                                          |
| `typeFuzzHarness.ts` _(Ph 2)_  | Drives generated source through the resolver (`serve --sources ops`) → entry modules → REAL runtime factories; records diagnostics + per-factory wire outcome.                                                                                      |
| `typeFuzzRunner.ts` _(Ph 2)_   | The Phase-2 driver: `runTypeFuzz` / `runTypeFuzzForDuration` — owns the resolver (restarts it on a hang), Tier-A (resolver/emit) on every type + Tier-B (value/robustness) per type.                                                            |
| `typeFuzz.integration.test.ts` | Phase-2 end-to-end sweep over generated TYPES (needs the binary).                                                                                                                                                                               |

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
| **O15** | strong      | `clone(v)` deep-equals `referenceClone(schema, v)`           |
| **O16** | strong      | clone never mutates its input, shares no mutable reference with it, and keeps the root prototype |
| **O17** | consistency | `validate(clone(v))` is true, `clone∘clone` is stable, and extras-injected inputs come out `hasUnknownKeys`-clean |

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
suite's `RT_FUZZ_*` env for you. Suites: `unit | value | types | enrich | i18n |
typemod | race | all`.

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

Adding a target: in `fuzz.integration.test.ts`, build a concretely-typed
`const schema = RT.…` and wire the `createX(schema)` factories into a
`FuzzTarget`. The plugin resolves each `createX` **statically from its argument
type**, so the schema must be a concrete `const` — never a generic `RunType`
parameter passed through a helper (that injects the `unknown` runtype).

## Findings

- **Binary encoder buffer overflow on valid data** (fixed). `createBinaryEncoderFn`
  owns its serializer and sizes it from adaptive history (`predictBufferSize`).
  After many small encodes the prediction converged down toward the running
  mean, so an above-average string overflowed the buffer and threw
  `RangeError: buffer too small … Call resize() and retry.` instead of growing.
  Fixed in two steps: the serializer's writers now GROW IN PLACE (no throw, no
  re-encode) and the size predictor moved from a mean-EMA to Welford
  mean + k·σ. See
  [`docs/done/binary-buffer-sizing.md`](./done/binary-buffer-sizing.md); pinned by
  `binaryEncoderResize.test.ts`.

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

Tier A (every type) catches resolver panics, hangs, malformed emit (invalid JS),
and dangling refs — the highest-value bugs. Tier B routes by a strict
`valueOracleSafe` gate: types whose value-generation provably matches the
validator get the full strong oracles (reusing the Phase-1 `fuzzOracle.ts` checks
verbatim); everything else gets the robustness probe. The value streams come
straight from the abstract type (`validValue` / `corruptValue` in
[`shapeValue.ts`](../packages/ts-runtypes/test/fuzz/value/shapeValue.ts)), so no
dependency on `createMockDataFn`.

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

- **Recursive types run Tier A only.** The in-process `evalEntryModules` linker
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
  type registers its closure once); fine for time-bounded runs.
- Not yet generated: branded `TypeFormat` primitives, generics / conditional /
  mapped types, template-literal types. Each is a natural new arm of `typeGen.ts`.
