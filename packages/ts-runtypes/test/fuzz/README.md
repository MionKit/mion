# Fuzz harness

Property-based / metamorphic fuzzing for RunTypes. Where the hand-written suites
under [`test/features/`](../features/) and [`test/suites/`](../suites/) try the
inputs _we_ thought of, the fuzzers here generate the ones nobody would write:
random **values**, random **types**, and random **edit sequences** — all driven
through the real Go resolver → plugin → runtime pipeline, all checked against
laws (oracles) that must hold for _every_ input rather than a hand-picked
expected answer.

This README is the developer map: what each oracle promises, what's in each
directory, how a run is wired, and how to reproduce a finding.

## Why oracles, not examples

A unit test asserts `validate(x) === true` for one hand-chosen `x`. A fuzz
**oracle** asserts a _property_ that must hold for any input at all — e.g.
"`validate` never throws", or "a value survives a JSON round-trip unchanged", or
"every codec strategy decodes to the same value". When a property breaks on a
generated input we've found a bug nobody wrote a test for. Every finding carries
the **seed** that produced it, so it replays byte-for-byte (see
[Reproducing a finding](#reproducing-a-finding)).

## Layout

```
test/fuzz/
├── vitest.fuzz-unit.config.ts   # standalone config for *.unit.test.ts (no Go binary)
├── core/                        # shared: deterministic RNG + random-type generator
├── value/                       # fix the type, fuzz the VALUE           (O1–O7)
├── roundtrip/                   # one type, every codec strategy must agree (RT-*)
├── type/                        # fuzz the TYPE itself                    (TR1–TR4 + O*)
├── jsonschema/                  # runTypeFromJsonSchema translation vs type-first    (JS-ID)
├── binary/                      # binary encoder size-estimation / buffer growth (O-SIZE-*)
├── cloning/                     # exact-shape clone vs a reference interpreter (O15–O17)
└── enrich/                      # model-based (stateful sequence) fuzzers  (R*, T*, NL/RC/CB…)
```

### Test-file suffixes

| Suffix                  | Runs under                                                   | Needs `bin/ts-runtypes`?            | What it is                                                                                                             |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `*.unit.test.ts`        | `vitest.fuzz-unit.config.ts` **and** the main package config | No — pure TS over hand-built graphs | Pins the fuzz _core_ (RNG, generators, mutators) without the compiler                                                  |
| `*.integration.test.ts` | main package config                                          | Yes — `.skipIf(!HAS_BIN)`           | Drives the full plugin pipeline; a fixed-iteration batch by default, an unbounded soak when its `*_SOAK_MS` env is set |
| `*.smoke.test.ts`       | main package config                                          | Yes (compiles types)                | A handful of seed-pinned shapes guarding one specific fix                                                              |
| `*.test.ts` (plain)     | main package config                                          | Varies                              | Gate / regression-corpus tests (`tsValidateGate`, `bugReprosValidTs`, `enrichRace`)                                    |

`pnpm test` runs everything that isn't opted out: the `*.unit`, `*.smoke`, and
the **fixed-iteration** integration batches all run (the root `pretest` builds
the Go binary first). The unbounded **soak** variants and the concurrency
**race** test stay dormant until you set their env var.

## The shared core (`core/`)

Everything downstream is built on two files, and both are deterministic so any
run replays from a single number.

- **`seededRng.ts`** — `mulberry32(seed)` is a tiny 32-bit PRNG.
  `withSeededRandom(seed, fn)` swaps the global `Math.random` for the seeded
  stream for the duration of `fn`, then restores it. Nothing threads a generator
  through call sites: the mock walker, the value generators and the mutators all
  just draw from `Math.random`, so wrapping a whole iteration in
  `withSeededRandom` makes it reproducible. `mixSeed(base, label, i)` folds a
  base seed, a stream label (`'value'`, `'roundtrip'`, …) and an iteration index
  into one uint32 so two streams never share a draw sequence.
- **`typeGen.ts`** — a recursive generator of random TypeScript types across the
  widest shape space we can express: scalars, literals, `Date`/`RegExp`/`bigint`,
  arrays, tuples, objects (optional / readonly / method / non-identifier keys),
  index signatures, `Record`, unions, intersections, `Map`/`Set`/`Promise`,
  the non-serialisable kinds (`function`, `symbol`, `ArrayBuffer`, typed arrays,
  `DataView`), and named `interface` (including recursive) / `declare class` /
  `enum` declarations. It emits an abstract `TypeShape`/`Decl` model and renders
  it to real TS source. Four presets tune the space:

  | Preset                       | `wild` | `nonDataTypes` | Drives                                                                                                              |
  | ---------------------------- | :----: | :------------: | ------------------------------------------------------------------------------------------------------------------- |
  | `DATA_GEN_OPTIONS`           |  off   |      off       | the strong value oracles — clean, round-trippable types only                                                        |
  | `NONDATA_GEN_OPTIONS`        |  off   |       on       | the DataOnly contract — adds symbols/functions/methods/`Promise`/class/native binary, without `any`/`unknown` noise |
  | `WILD_GEN_OPTIONS` (default) |   on   |       on       | the full adversarial space — everything, plus `any`/`unknown`/`never`/`void` and primitive-branded intersections    |

  Generated unions are kept value-level **disjoint** (distinct literals /
  primitive kinds / discriminant tags) so the strong oracles stay sound;
  intersections use disjoint member property names so the merge is inhabitable.
  `pruneUnreachableDecls` drops any declaration the root can't reach, and
  `isRecursive` flags cyclic types (the in-process harness linker can't execute a
  cyclic function graph, so recursive types are restricted to the resolver/emit
  oracles).

## The fuzz modes

### `value/` — fix the type, fuzz the value

Holds a small set of concrete schemas and floods each with **three** value
streams per seed: a conforming mock, that mock mutated to a provably-invalid
value at exactly one position, and pure type-blind junk. Checks the value
oracles **O1–O7** (see [the catalog](#oracle-catalog)).

- `fuzzOracle.ts` — the O1–O7 property checks + the `Violation` shape.
- `shapeValue.ts` — generates conforming values (and single-point corruptions)
  from a `GeneratedType`, respecting recursion budgets and the DataOnly
  projection.
- `invalidValue.ts` — metamorphic mutation: corrupts a valid value to a provably
  invalid one per kind/position (without descending through `union`/`any`/
  `unknown`, where "invalid" isn't well-defined).
- `fuzzRunner.ts` — the iteration driver (`runFuzz` for a fixed count,
  `runFuzzForDuration` for a soak).
- `fuzz.integration.test.ts` — 100 iterations × the concrete targets through the
  real compiled factories; the `*.unit.test.ts` files pin `shapeValue` /
  `invalidValue` against a reference structural validator with no binary.

### `roundtrip/` — every codec strategy must agree

Generates one random **serialisable** type, compiles _all_ of its codecs at once
— the four JSON encoder strategies (`clone`/`mutate`/`direct`/`compact`) each
paired with its decoder (`strip`/`preserve`/`strip`/`compact`), plus the binary
codec — then sends one generated value through every lane and cross-checks them.

Oracle IDs (`roundtripOracle.ts`): **RT-VALIDATE** (both input and output
validate), **RT-AGREE** (re-encoding each lane's decoded value through the
canonical clone encoder reproduces the original clone wire — every lane
round-trips to the same DataOnly value), **RT-STABLE** (each lane's own wire is
byte-stable under re-encode), **RT-FAILAGREE** (a type one lane refuses, every
lane refuses), **RT-NATIVE** (keyed encoders emit JSON that native `JSON.parse`
reads back identically — an encoder check independent of our decoders), and
**RT-THROW** (no lane throws an uncontrolled error on a valid value).

- `roundtripHarness.ts` — renders the fixture (one `type T` + the factory call
  sites), drives resolve/emit, and wires the factories by strategy tag.
- `roundtripOracle.ts` — the RT-\* checks + the static gates
  (`compactNullRisk`, `jsonRoundTripSafe`) that exclude a lane a value would
  legitimately break.
- `roundtripRunner.ts` — orchestration; owns the resolver client and restarts it
  on a compile timeout.
- `allStrategyRoundtrip.integration.test.ts` — 100-iteration batch; soak via
  `RT_FUZZ_ROUNDTRIP_SOAK_MS`.

### `type/` — fuzz the type itself

The part most libraries never attempt. Each iteration **generates a random
type**, emits a source module with one call site per factory family, runs it
through the real resolver + plugin, evaluates the emitted entry modules,
wires the factories in-process, and only then fuzzes a value through them.

Two oracle tiers: build-level **TR1–TR4** run on _every_ generated type
(resolver clean, every call site resolved, every emitted module evaluates, every
factory materialises); the strong value oracles (O1–O7, and O10/O12/O14 for the
DataOnly lane) run only on the serialisable subset — the tier is chosen from the
resolver's own diagnostics, not guessed at generation time.

- `typeFuzzHarness.ts` / `typeFuzzRunner.ts` — compile-a-type harness + the
  per-iteration oracle driver.
- `tsValidate.ts` — a **false-positive gate**: tsgo is lenient and will still
  emit a RunType for input that doesn't strictly type-check, so before a
  violation is reported it is re-checked with the real `typescript` compiler; a
  "bug" on a type that doesn't compile is discarded. `tsValidateGate.test.ts`
  pins that the gate keeps real violations and drops the invalid-TS ones.
- `typeFuzz.integration.test.ts` — the WILD-space batch/soak
  (`RT_FUZZ_TYPES_SOAK_MS`).
- `nonDataTypeFuzz.integration.test.ts` — the DataOnly lane: types deliberately
  carrying symbols/functions/methods/typed-arrays/`Promise`, fed **real**
  `createMockDataFn` values, checking the serialize-vs-drop-vs-fail contract
  (`RT_FUZZ_NONDATA_SOAK_MS`).
- `bugReprosValidTs.test.ts` — a corpus of minimal, seed-pinned repros of bugs
  the type fuzzer found (each compiles clean; includes a negative control).
- `*.smoke.test.ts` — one fix apiece: `indexSigDroppedProp` (G6),
  `mapSetUnionEnvelope` (G5), `unionStrippedSibling` (G3/G4), `nonDataMock`.

### `jsonschema/` — runTypeFromJsonSchema translation vs type-first

The convergence contract of the `ts-runtypes/json-schema` subpath, fuzzed:
`runTypeFromJsonSchema({...})` must resolve to the SAME structural id as the hand-written
type-first equivalent. Each iteration generates a wild type (typeGen),
**normalizes** it into the JSON-Schema-expressible subset
(`toSchemaExpressible` — inexpressible kinds are _replaced_, not dropped, so
nesting survives: Map→Record, Set→Array, Promise→value, bigint→number,
enum refs→literal unions, method props dropped, recursive interfaces→`$defs`),
then renders that ONE normalized shape twice into a single fixture — a TS
`type T = …` with `getRunTypeId<T>()` and a schema literal through a
marker-contract wrapper typed against the REAL `FromJsonSchema` (the
`jsonschema-extract` region sliced verbatim, so the fuzzed type can never
drift from the shipped one). Both marker call shapes per fixture (static +
value-inferred), same in-memory resolver as the type lane.

- **JS-ID** (the one oracle): the two reflection sites resolve to equal ids.
- `schemaRender.ts` — the normalizer + schema-literal renderer. This lane
  caught BOTH halves of the shared-recursive-container divergence family
  (batch: the depth-splice class; soak: the entry-point-anchoring class), and
  both were then fixed in the Go id computer — the second via canonical
  quotient emission (docs/done/typeid-scc-entry-point-anchoring.md). The lane
  now runs unguarded.
- `schemaRender.unit.test.ts` — pins the normalizer mappings and the 2020-12
  spellings.
- `jsonSchemaFuzz.integration.test.ts` — the batch/soak
  (`RT_FUZZ_JSONSCHEMA_SOAK_MS`), with the same lazy `tsValidate`
  false-positive gate as the type lane.

### `binary/` — binary size estimation & buffer growth

Targets the binary encoder's cold-start size estimate and its dynamic buffer.
Two lanes per generated type: an **in-bounds** value (`respectBinarySize: true`)
must fit the pre-sized buffer with no resize; an **oversized** negative control
(`respectBinarySize: false`) must trigger growth and still round-trip.

- `sizeOracle.ts` — **O-SIZE-NOGROW** (an in-bounds value never resizes the cold
  buffer), **O-SIZE-ROUNDTRIP** (decode/re-encode is byte-stable), **O-SIZE-GREW**
  (the oversized lane, if it encodes, still round-trips).
- `sizeEligible.ts` — filters generated types to the serialisable kinds the size
  lane applies to (excludes the non-data leaves and callable/class refs).
- `sizeFuzzRunner.ts` — driver; respawns the resolver on crash and keeps a
  deterministic floor so a run can't silently go vacuous.
- Tests: `binarySizeEstimate.integration` (the soak, `RT_FUZZ_SIZE_SOAK_MS`),
  `binarySizeFloors` (per-kind reserve floors at an adversarial tiny config),
  `binaryDynamicGrow` + `binaryEncoderResize` (the grow-in-place path — the
  buffer-overflow / adaptive-history regressions), `binaryIndexSig.smoke` (F1).

### `cloning/` — the compiled clone vs a reference interpreter

Targets `createCloneExactShapeFn<T>()`. The strong oracle is **differential**:
a naive reference interpreter walks the reflected RunType graph and the
compiled clone must agree with it on every conforming value. Three input
streams per target: a **valid** mock, an **extras** mutation (the same mock
decorated with undeclared keys, so the value stays valid while the clone must
strip every one), and type-blind **junk** for robustness only.

- `cloneOracle.ts` — **O15** clone-reference (`deepEqual(clone(v), referenceClone(schema, v))`),
  **O16** clone-isolation (the input still deep-equals its pre-clone snapshot,
  the clone shares no mutable object reference with it, and an object-typed
  root keeps the input root's prototype), **O17** clone-consistency
  (`validate(clone(v))` holds and `clone(clone(v))` is stable).
- `referenceClone.ts` — the reference interpreter: mirrors the Go emitter's
  per-kind arms in
  [`clone_exact_shape.go`](../../../../ts-go-runtypes/internal/cachegen/typefunctions/clone_exact_shape.go)
  one-for-one, trading every output-shape decision for the dumbest possible
  implementation (no caching, no fastpaths) so a disagreement is eyeballable.
- `extrasValue.ts` — the clone-fuzz twin of `invalidValue.ts`: injects 1–3
  `__fz_extra_<n>` keys at plain-object positions of a deep copy. Same
  one-directional soundness contract — when it returns a value, `validate<T>`
  must still be true AND a correct clone must drop every injected key, so the
  walker stays deliberately conservative.
- `cloneFuzzRunner.ts` — pure data-in/report-out driver under seeded
  `Math.random`, so a violation replays from its `seed`.
- Tests: `cloneFuzz.integration` (the soak, `RT_FUZZ_CLONE_SOAK_MS`).

### `enrich/` — model-based (stateful) fuzzers

Three **sequence** fuzzers: instead of one input, they feed a _sequence_ of
random commands to a stateful system and re-check invariants after each step,
maintaining a lightweight in-memory **model** of the expected state. Each
shrinks a failing sequence to a minimal reproducer and replays by seed. All
three skip without `bin/ts-runtypes`, and all drive the CLI through
`enrichCli.ts` — a **non-throwing** wrapper so the oracles can observe exit
code / stdout / stderr / JSON findings on both success and failure paths.

- **enrich CLI sync** (`enrichModel.ts`, `enrichFuzzRunner.ts`,
  `enrichFuzz.integration.test.ts`) — random edits to a source type reconciled
  into the FriendlyText/MockData mirror via `gen` / `gen --update` / `gen
--prune` / `check`. Invariants: idempotence, metamorphic change, authored-value
  preservation, orphan carcasses, prune scope, totality (`R1/R2/R3/R5/R6/R7a/R8/R10`).
- **i18n sync** (`i18nModel.ts`, `i18nFuzzRunner.ts`,
  `i18nFuzz.integration.test.ts`) — the source type is canonical; translations
  are derived with `enrich --i18n`. Invariants include never-copy (mirror text
  never leaks into a translation), plural-arm ownership, kind stability
  (`T1–T7/T10`).
- **type-mod** (`typeModify.ts`, `typeModFuzzRunner.ts`,
  `typeModFuzz.integration.test.ts`) — a random deep type put through a sequence
  of valid edits _and_ transient text-level corruptions; checks nothing-authored
  is ever lost (`NL`), root renames carry labels onto the live const (`RC`), a
  blank-valued twin reconciles to the same structure (`CB`), plus convergence /
  totality / parse-safety.
- **race** (`enrichRace.test.ts`) — fires several concurrent `gen --update`
  processes at one fixture to prove the atomic mirror write never tears. **Skips
  by default**; it self-enables only under `RT_FUZZ_RACE=1` (set by
  `rtx core fuzz race`).

## Running

The `rtx` front door builds the binary first, then runs the suite:

```bash
pnpm rtx core fuzz <suite> [--soak]
#   suite ∈  unit | value | types | jsonschema | cloning | enrich | i18n | typemod | race | all
#   --soak   swaps the fixed batch for the long soak knobs (see rt.mjs FUZZ table)
```

- `unit` runs the pure-TS core tests via `vitest.fuzz-unit.config.ts` (no
  binary).
- `value` / `types` / `jsonschema` / `cloning` / `enrich` / `i18n` / `typemod` each run one
  integration file; `--soak` turns up its iteration/duration env.
- `race` is the only path that sets `RT_FUZZ_RACE=1`.
- `all` is a quick trio (`fuzz.integration`, `typeFuzz.integration`,
  `binaryEncoderResize`).

`pnpm test` alone already runs every fixed-iteration batch (roundtrip, binary
size, non-data, and the smoke/gate tests included). The **roundtrip** and
**binary-size** soaks aren't wired into `rtx core fuzz`; run them directly:

```bash
RT_FUZZ_ROUNDTRIP_SOAK_MS=120000 pnpm exec vitest run allStrategyRoundtrip.integration
RT_FUZZ_SIZE_SOAK_MS=120000      pnpm exec vitest run binarySizeEstimate.integration
```

## Reproducing a finding

Every violation is logged with the seed that produced it. To replay:

- **Stateless fuzzers** (value / roundtrip / type / binary): set the base seed
  and a short soak so the runner re-derives the same stream, e.g.
  `RT_FUZZ_SEED=<seed> RT_FUZZ_TYPES_SOAK_MS=5000 pnpm exec vitest run typeFuzz.integration`.
- **Model-based fuzzers** (enrich / i18n / typemod): use the dedicated replay
  var, which re-runs that one sequence verbatim and shrinks it to the minimal
  reproducer — `RT_FUZZ_ENRICH_REPLAY=0x<seed>`, `RT_FUZZ_I18N_REPLAY=0x<seed>`,
  `RT_FUZZ_TYPEMOD_REPLAY=0x<seed>`.

Then fix the bug and **pin it**: add the minimal repro to
[`test/features/`](../features/) (stateless value/codec bugs) or a
`*.smoke.test.ts` here (type-shape bugs), and record the finding under
[`docs/done/`](../../../../docs/done/). That seed → replay → fix → pin loop is
why a feature can change and we still trust thousands of strange inputs keep
behaving.

## Environment variables

The authoritative list is the `REGISTRY` in
[`scripts/lib/env.mjs`](../../../../scripts/lib/env.mjs) (`pnpm run check:env`);
all fuzz knobs are `dev`-scoped with sensible defaults.

| Variable                                                                     | Effect                                                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `RT_FUZZ_SEED`                                                               | Base PRNG seed for a soak/replay run (per-fuzzer default)               |
| `RT_FUZZ_SOAK_MS`                                                            | value fuzz soak duration (ms)                                           |
| `RT_FUZZ_TYPES_SOAK_MS`                                                      | type fuzz soak duration (ms)                                            |
| `RT_FUZZ_NONDATA_SOAK_MS`                                                    | non-data type fuzz soak duration (ms)                                   |
| `RT_FUZZ_JSONSCHEMA_SOAK_MS`                                                 | json-schema translation fuzz soak duration (ms)                         |
| `RT_FUZZ_CLONE_SOAK_MS`                                                      | clone fuzz soak duration (ms)                                           |
| `RT_FUZZ_ROUNDTRIP_SOAK_MS`                                                  | round-trip fuzz soak duration (ms)                                      |
| `RT_FUZZ_SIZE_SOAK_MS`                                                       | binary-size fuzz soak duration (ms)                                     |
| `RT_FUZZ_ENRICH_SEQUENCES` / `_MAXCMDS` / `_REPLAY`                          | enrich fuzz: sequence count / commands per sequence / replay one seed   |
| `RT_FUZZ_I18N_SEQUENCES` / `_MAXCMDS` / `_REPLAY`                            | i18n fuzz: same three knobs                                             |
| `RT_FUZZ_TYPEMOD_SEQUENCES` / `_MAXSTEPS` / `_REPLAY` / `_REPORT` / `_DEBUG` | type-mod fuzz: sequences / steps / replay / print stats / verbose diffs |
| `RT_FUZZ_RACE` / `_RACE_ITERATIONS` / `_RACE_FANOUT`                         | enable + tune the enrich race test                                      |

## Oracle catalog

Grouped by mode.

| Mode                      | IDs                                                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| value / type (value tier) | **O1** valid-accepted · **O2** invalid-rejected · **O3** validate-total · **O4** errors-agree · **O5** json-stable · **O6** binary-stable · **O7** encode-total · **O10** refusal-has-reason · **O12** json↔binary agree · **O14** encoders-agree-on-serialisability |
| type (build tier)         | **TR1** resolver-clean · **TR2** every-site-resolved · **TR3** every-module-evaluates · **TR4** every-factory-materialises                                                                                                                                           |
| roundtrip                 | **RT-VALIDATE** · **RT-AGREE** · **RT-STABLE** · **RT-FAILAGREE** · **RT-NATIVE** · **RT-THROW**                                                                                                                                                                     |
| binary size               | **O-SIZE-NOGROW** · **O-SIZE-ROUNDTRIP** · **O-SIZE-GREW**                                                                                                                                                                                                           |
| cloning                   | **O15** clone-reference · **O16** clone-isolation · **O17** clone-consistency                                                                                                                                                                                        |
| enrich (model)            | **R1/R2/R3/R5/R6/R7a/R8/R10**                                                                                                                                                                                                                                        |
| i18n (model)              | **T1/T2/T3/T4/T5/T6/T7/T10**                                                                                                                                                                                                                                         |
| type-mod (model)          | **NL** nothing-lost · **RC** rename-carry · **CB** content-blind · **R6** convergence · **R10** totality · **P** parse-safety                                                                                                                                        |

</content>
</invoke>
