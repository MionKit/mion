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

## ⚠️ Real types, never copies

**Fuzz fixtures always use the REAL shipped types — imported — wherever an
import can resolve.** The resolver harnesses hand the whole `src/` tree to the
resolver's virtual filesystem (`SRC_OVERLAY` in `type/typeFuzzHarness.ts`)
precisely so that fixtures can write `import type * as TF from
'./src/formats/index.ts'` and reference `TF.UUID`,
`TF.FormattedArray<…>` etc. directly. A hand-written copy of a shipped type
does not fail when the shipped type changes — it silently keeps testing the
old shape, which is the one failure mode a fuzz suite cannot afford (a copied
`email` leaf once drifted into 7 false soak findings before anyone noticed).

Restating a type is a RARE, documented exception, allowed only where an import
physically cannot resolve (fixtures written into scratch temp dirs with no
mion install), and every such exception MUST carry a pin test that
compares the restated spelling against the shipped type by structural id, so
drift fails loudly. The full list today: `FUZZ_FORMAT_SCRATCH_PREAMBLE`
(typeGen.ts, pinned by `enrich/scratchFormatPreamble.test.ts`) and
`i18nModel.ts`'s inline spellings (pinned by
`enrich/i18nInlineSpelling.test.ts`). The marker module itself needs no
stand-in at all: `MARKER_PACKAGE_OVERLAY` (@mionjs/devtools helpers)
serves the REAL package's package.json + built dist .d.ts tree as virtual
node_modules, so `@mionjs/run-types` resolves the way a consumer install
does. Before adding a third restatement, exhaust every way to import the
real thing first.

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
├── core/                        # shared: deterministic RNG + random-type generator + crash guard
├── value/                       # fix the type, fuzz the VALUE           (O1–O7)
├── roundtrip/                   # one type, every codec strategy must agree (RT-*)
├── type/                        # fuzz the TYPE itself                    (TR1–TR4 + O*)
├── binary/                      # binary encoder size-estimation / buffer growth (O-SIZE-*)
├── cloning/                     # exact-shape clone vs a reference interpreter (O15–O17)
├── elision/                     # unused-builder elision: the two spellings stay equivalent (E0–E3)
├── security/                    # attack the DECODERS: hostile bytes, JSON trees, format pumps (SB-*, SJ-*, SF-*)
└── enrich/                      # model-based (stateful sequence) fuzzers  (R*, T*, NL/RC/CB…)
```

### Test-file suffixes

| Suffix                  | Runs under                                                   | Needs `mion-bin/mion`?              | What it is                                                                                                             |
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

Everything downstream is built on these files, and all of it is deterministic
so any run replays from a single number.

- **`seededRng.ts`** — `mulberry32(seed)` is a tiny 32-bit PRNG.
  `withSeededRandom(seed, fn)` swaps the global `Math.random` for the seeded
  stream for the duration of `fn`, then restores it. Nothing threads a generator
  through call sites: the mock walker, the value generators and the mutators all
  just draw from `Math.random`, so wrapping a whole iteration in
  `withSeededRandom` makes it reproducible. `mixSeed(base, label, i)` folds a
  base seed, a stream label (`'value'`, `'roundtrip'`, …) and an iteration index
  into one uint32 so two streams never share a draw sequence.
- **`crashGuard.ts`** — the generic crash-capture mechanism every lane's loop
  wraps its per-iteration body in. A HARD failure (a resolver error, a
  harness throw — something the oracles never see because no result exists to
  check) becomes a replayable `{seed, message}` record on the report's
  `crashes` list instead of killing the run, so a long soak keeps hunting and
  fails loudly at the end with every crash listed. A streak of
  `CRASH_STREAK_LIMIT` consecutive crashes still rethrows immediately:
  different seeds failing identically means the harness broke (dead client,
  missing binary), not a generated shape. Born from the elision lane's first
  20-minute soak dying mid-run on a real resolver panic with no seed recorded.
- **`runLoop.ts`** — the one loop skeleton every generation lane runs on.
  `runFuzzLoop` (async) / `runFuzzLoopSync` own the six things each runner used
  to spell by hand: defaulting the entry seed, deriving each step's seed with
  `mixSeed`, running either a fixed round count or a `soakBudget.ts` wall clock,
  wrapping every step in the crash guard, marking the budget and tracking the
  slowest round (the pathology tripwire's `slowestIterationMs` /
  `slowestIterationRound`), and streaming new violations to `onViolation`. A
  lane passes a per-round callback and keeps everything else — its resources,
  its stats, its violation type, its report. Deliberately not a framework: it
  owns the invariants a new lane must not be able to forget, and nothing more.
  A _round_ is the budget unit (one mark each, the soak stops between rounds), a
  _step_ is the seeding and crash-guarding unit; most lanes run one step per
  round, the value and cloning lanes run one per target inside a round.
- **`typeGen.ts`** — a recursive generator of random TypeScript types across the
  widest shape space we can express: scalars, literals, `Date`/`bigint`,
  arrays, tuples, objects (optional / readonly / method / non-identifier keys),
  index signatures, `Record`, unions, intersections, `Map`/`Set`/`Promise`,
  the non-serialisable kinds (`function`, `symbol`, `RegExp`, `ArrayBuffer`, typed arrays,
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
  `MION_FUZZ_ROUNDTRIP_SOAK_MS`.

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
  (`MION_FUZZ_TYPES_SOAK_MS`).
- `nonDataTypeFuzz.integration.test.ts` — the DataOnly lane: types deliberately
  carrying symbols/functions/methods/typed-arrays/`Promise`, fed **real**
  `createMockDataFn` values, checking the serialize-vs-drop-vs-fail contract
  (`MION_FUZZ_NONDATA_SOAK_MS`).
- `bugReprosValidTs.test.ts` — a corpus of minimal, seed-pinned repros of bugs
  the type fuzzer found (each compiles clean; includes a negative control).
- `*.smoke.test.ts` — one fix apiece: `indexSigDroppedProp` (G6),
  `mapSetUnionEnvelope` (G5), `unionStrippedSibling` (G3/G4), `nonDataMock`.

### `binary/` — binary size estimation & buffer growth

Targets the binary encoder's cold-start size estimate and its dynamic buffer.
Two lanes per generated type: an **in-bounds** value (`respectBinarySize: true`)
must fit the pre-sized buffer with no resize; an **oversized** negative control
(`respectBinarySize: false`, one position inflated past `sizeMaxBytes`, the cap
every estimate stays under) must trigger growth and still round-trip.

- `sizeOracle.ts` — **O-SIZE-NOGROW** (an in-bounds value never resizes the cold
  buffer), **O-SIZE-ROUNDTRIP** (decode/re-encode is byte-stable), **O-SIZE-GREW**
  (the oversized lane, if it encodes, still round-trips).
- `sizeEligible.ts` — filters generated types to the serialisable kinds the size
  lane applies to (excludes the non-data leaves and callable/class refs).
- `sizeFuzzRunner.ts` — driver; respawns the resolver on crash and keeps a
  deterministic floor so a run can't silently go vacuous.
- Tests: `binarySizeEstimate.integration` (the soak, `MION_FUZZ_SIZE_SOAK_MS`),
  `binarySizeFloors` (per-kind reserve floors at an adversarial tiny config),
  `binaryOversizedControl` (the floor's oversized control grows for every seed
  under every config),
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
- Tests: `cloneFuzz.integration` (the soak, `MION_FUZZ_CLONE_SOAK_MS`).

### `elision/` — the two schema spellings stay equivalent

Targets the unused-builder-const elision: a builder const referenced only via
`InferType<typeof rt>` emits NO reflection graph, while any value use keeps it.
ONE generator covers the FULL space: each iteration draws from `typeGen`
(the convert lane's generation space) and derives the builder spellings with
the REAL `mion convert --to builders` CLI — no hand-written builder
printer exists here, so there is nothing to drift from the product converter
(`internal/convert/printbuilder.go`), and every fixture's builder spelling is
byte-for-byte what a user's conversion would produce. The converted output IS
the static spelling (`const rt = …; type T = InferType<typeof rt>;` with the
calls naming `T`); the value spelling is a tail swap of the lane's own three
calls to `createXFn(rt)`. Designed converter refusals re-roll (pinning the
refusal surface is the convert lane's job) and are reported.

- `elisionOracle.ts` — **E0** fixture integrity (each spelling resolves exactly
  its three createX sites), **E1** entry equivalence (same fn-entry keys, and
  every function-side module the static form emits exists BYTE-IDENTICALLY in
  the value form's output — reflection modules excluded, call-site coordinates
  in alwaysThrow messages normalized; byte equality is strictly stronger than
  probing values), **E2** emission split, DIFFERENTIAL and escape-aware: a
  builder-printed root's reflection site must be gone from the static form and
  the value form must carry exactly one more, while a `getRunType<T>()` escape
  (never elidable by design) rides both spellings and cancels out; strict
  zero-reflection is asserted for declaration-free, escape-free fixtures.
- `elisionRunner.ts` — **E3** behavior floor on the static form (the elided
  spelling is the feature's risk surface), on the diagnostics-clean tier that
  `shapeValue` provably models (`valueOracleSafe`, non-floored values,
  structural-format shapes excluded — shapeValue does not model contains /
  uniqueItems constraints): validate accepts a conforming probe and rejects a
  proven corruption; codec behavior needs no probing because E1's byte
  equality already carries it. Hard resolver errors are not an oracle here —
  they ride the generic crash guard (`core/crashGuard.ts`), which this lane's
  first soak motivated by finding a real emitter panic (an NS-sentinel base
  reaching the contains / patternProperties splices in the validate emitter).
- Tests: `elisionFuzz.integration` (the soak, `MION_FUZZ_ELISION_SOAK_MS`);
  `elisionOracle.unit` (binary-free negative controls: every oracle proven to
  fire on a deliberately broken output).

### `security/` — attack the decoders

Every other lane checks correctness on VALID input. This one acts as an
attacker: it starts from a valid wire and mutates it, then checks the rules
that must hold for every input, hostile or not. Three lanes, one shared
vulnerability dictionary.

- `attackDictionary.ts` — the **vulnerability dictionary**: for every kind of
  data a decoder rebuilds (string, number, bigint, boolean, Date,
  Temporal, literal, enum, union, array, tuple, object, record, Map, Set,
  any, optional, string / number formats), the known and possible attacks
  with concrete payloads, each tagged with a vulnerability class (memory,
  truncation, type confusion, prototype pollution, ReDoS, stack, raw error,
  transform, unicode, numeric, envelope, time) and an `expect`: `'reject'`
  means the type rules the payload out, so `parse` must throw and a decoder
  must throw or hand back a value `validate` refuses; a mis-accept is a
  finding. The **wrong-type matrix** is generated on top: one sample of every
  other kind at every position (a string in a number slot, `true` in a string
  slot, an object where an array goes). Unions get the whole envelope treated
  as a target: indexes outside the union, negative, float, string, `true`,
  null; envelope missing, short, long, not an array; a valid index with
  another arm's payload; discriminant missing, wrong, as an array.
  `attackDictionary.unit.test.ts` pins that every class has an entry and
  every kind has attacks. To add an attack, add one row.
- `positions.ts` — walks a generated type next to the PARSED JSON tree of a
  valid value (Date is a string there, a Map an array of pairs, a union member
  sits in its `[index, value]` envelope) and yields every position with the
  kind that picks its attacks. Positions under a union or `any` carry
  `underCatchAll`, which downgrades `'reject'` to `'any'` (a sibling arm may
  legitimately accept).
- `treeMutations.ts` — splices a dictionary payload at a position (a
  prototype key as an OWN key, the way `JSON.parse` yields it) or a random
  junk subtree (the blind layer), producing the JSON text the decoders read
  and the re-parsed tree `parse` reads from one `JSON.stringify`.
- `wireMap.ts` — decodes the valid BINARY wire once through an instrumented
  deserializer and records every read the compiled decoder makes (offset +
  reader). That is the wire as the decoder sees it: each read is a position
  and the reader names its kind, so a count bomb lands where a count lives, a
  string length past the buffer where a string lives, NaN bytes where a float
  lives, an out-of-range discriminator where the union tag lives.
- `wireMutations.ts` — the blind byte mutators (bit flips, substitution,
  truncation at every offset, duplication, insertion, varint inflation,
  random bytes, "a huge varint then nothing") and the dictionary's byte
  payloads per wire-map read.
- `stringPumps.ts` — floods, sample stretches and corruptions, bracket nests,
  RTL runs and lone surrogates, up to 64 KB, for the format lane.
- `securityOracle.ts` — the SB / SJ / SF oracles (catalog below) and the
  prototype walker behind SJ-PROTO.
- `securityWorker.ts` + `securityWorkerHost.ts` — the binary lane runs every
  decode in a heap-capped CHILD PROCESS (`--max-old-space-size`), forked from
  the vitest worker. The child posts the attack id before each decode, so an
  out-of-memory (V8's fatal "invalid table size" allocation failure takes a
  whole process down, which is why this is a process and not a worker thread)
  or a hang lands as a crash record carrying the attack and the seed, and the
  run keeps hunting. The child loads the run-types **dist** natively (Node's
  type stripping cannot load the devtools graph), so `pnpm run check:builds`
  is a prerequisite.
- `prefixReader.ts` — the PRE-FIX binary reader and `string[]` arm, kept as
  the negative control's twin: `securityOracle.unit.test.ts` proves the lane
  catches the silent truncation (`["hello","world","a"]` from a cut buffer,
  SB-BOUNDS) and the count bomb (a five-byte body, SB-OOM as a crash record)
  against it, then that every oracle fires on a broken decoder.
- `binaryDecodeRunner.ts` / `jsonDecodeRunner.ts` / `formatPatternRunner.ts`
  - the three `*.integration.test.ts` — the lanes. The report counts how often
    every attack family fired (`applied`) and how decoders failed (`outcomes`,
    the throw histogram), so a silently unreachable attack cannot pass.

What they found on first contact, fixed in the same change with seed-free
repros under `test/features/`: the binary reader read past the buffer
silently (`desLength` / `desString` took `undefined` as zero), a count claimed
by the wire was allocated before the bytes behind it were checked (a five-byte
body exhausted the heap; `desCount` / `desCountU32` now bound every count by
the bytes left, with `minWireBytes` on the Go side and a fixed ceiling for
zero-byte items), the arms that consume bytes without reading them (a null
sentinel, an optional-property bitmap) walked past the end silently (the
decoder now compares its index to the buffer once after the walk), the JSON
restore loops trusted a non-array's `.length`
(`{"length": 1e9}` at an array position looped a billion times before validate
ran; every element loop is now behind `Array.isArray`), the Date / bigint /
Temporal / Map / Set restore arms coerced whatever the wire held (`null`
became an epoch Date, `true` became `1n`, `null` an empty Set, so `parse`
accepted them; every arm now rebuilds only from its wire form and leaves
anything else for the check), and the compact decoder rebuilt an object from a
bare number (`{}` for a type whose props are all optional; the positional
rebuild is now behind `Array.isArray` too).

Decoders deliberately throw whatever the failing arm throws (a
`BinaryDecodeError` from the reader, a `SyntaxError` from `BigInt`, the
engine's own `TypeError`): no wrapper on the hot path, a caller catches and
rethrows. `parse` is the typed entry point and keeps its `RTParseError`
promise on every hostile input (SJ-PARSE). A decoder throw is a histogram
entry in the report, not a finding.

**`secgen` — the generated-code corpus scan.** The other three lanes attack a
compiled decoder with input; this one reads the code the emitters produced.
Every entry module of a generated type (names, literals and enum members drawn
from a pool that carries quotes, backslashes, newlines, a Unicode line
terminator and a planted marker) goes through the checks in
`generatedCodeOracle.ts`: the body compiles as strict JavaScript (GC-PARSE),
carries no raw control byte or line terminator (GC-TEXT), the marker never
appears outside a string or regex literal (GC-INJECT, the injection oracle),
every loop that writes wire keys onto a fresh object carries the
prototype-name guard and nothing calls `Object.assign` (GC-REBUILD), a binary
decoder allocates and loops only on a bounded count (GC-COUNT), every
`new RegExp(` takes a build-time literal (GC-REGEXP), no property access
spells a non-identifier name bare (GC-ACCESS), and a JSON decoder converts a
wire value (`new Date(x)`, `BigInt(x)`, `Temporal.X.from(x)`, `new Map(x)`,
`new Set(x)`, a symbol literal, the union envelope) only after a shape check on
the same variable (GC-GUARD, the JS twin of the resolver's `MustValidateJson`
table). `generatedCodeOracle.unit.test.ts`
proves each check fires on broken text; `test/features/generatedCodeAudit.test.ts`
runs the same checks over a hand-written nasty corpus in `pnpm test`.

**`sechttp` — hostile requests at the mion router.** The one lane that lives
outside this package, under `packages/router/test/fuzz/security/`, on the same
core (`runFuzzLoop`, the seed policy, the crash guard). Two layers: seeded
attacks through `dispatchRoute` in process (random paths including prototype
names, JSON bodies mutated from valid ones, JSON text cut and flipped, binary
bodies with flipped bits, inflated varints, count bombs and trailing bytes,
junk `?data=` query bodies, mutated routesFlow queries, hostile headers), and
raw HTTP at the node adapter on a free port (a content-length past the limit
or that lies, a chunked body that overflows, junk `?data=`, prototype header
names, an oversized header, garbage on the wire). Oracles: the router and the
process still answer a known-good request after every attack (SH-ALIVE), every
response is a well-formed envelope with a plain-token `x-rpc-error` header and
nothing internal on any thrown error (SH-ENVELOPE), malformed input never
yields a 5xx (SH-NO5XX), no response carries engine error text or a file path
(SH-NOLEAK), each request stays inside its budget (SH-TIME), and
`Object.prototype` is untouched after the run (SH-PROTO). Replay a finding
with `MION_FUZZ_SEED=<seed> pnpm miondevx core fuzz sechttp`.

### `enrich/` — model-based (stateful) fuzzers

Three **sequence** fuzzers: instead of one input, they feed a _sequence_ of
random commands to a stateful system and re-check invariants after each step,
maintaining a lightweight in-memory **model** of the expected state. Each
shrinks a failing sequence to a minimal reproducer and replays by seed. All
three skip without `mion-bin/mion`, and all drive the CLI through
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
  by default**; it self-enables only under `MION_FUZZ_RACE=1` (set by
  `miondevx core fuzz race`).

## Running

The `miondevx` front door builds the binary first, then runs the suite:

```bash
pnpm miondevx core fuzz <lane…> [--quick|--soak]
#   lane ∈   unit | value | types | nondata | roundtrip | size | cloning |
#            secbinary | secjson | secformat | secgen |
#            enrich | i18n | typemod | race | sidecar | patterngen | convert | convertcli | all
#   --quick  the per-PR tier: ~2x the fixed batch (what ci.yml runs)
#   --soak   the release tier: the long soak knobs (see the miondevx.mjs FUZZ table)
```

- `unit` runs the pure-TS core tests via `vitest.fuzz-unit.config.ts` (no
  binary).
- `value` / `types` / `cloning` / `enrich` / `i18n` / `typemod` each run one
  integration file; `--quick` and `--soak` turn up its iteration/duration env.
- `race` is the only path that sets `MION_FUZZ_RACE=1`.
- `all` runs EVERY lane at its default budget: the whole `test/fuzz` tree, both
  sidecar lanes, the race test, and both Go sweeps under `internal/convert`
  (including the lane-less schemadoc determinism sweep). It takes no tier flag —
  a quick or soak round is per-lane, so the time-boxed lanes never share CPU.
- Several lanes in one invocation (`pnpm miondevx core fuzz types value --quick`) pay
  vitest's startup once; if any of them is time-boxed, miondevx runs the files
  sequentially and says so.

`pnpm test` alone already runs every fixed-iteration batch (roundtrip, binary
size, non-data, and the smoke/gate tests included), and `go test ./internal/...`
runs the Go-side `convert` sweep. So `miondevx core fuzz` is not what makes a lane
run — it is the **tier / replay** front door, and `race` is the only lane it
gates (nothing else sets `MION_FUZZ_RACE=1`).

**Three budget tiers.** The default batch is a floor, not coverage. `--quick` is
the per-PR tier and runs on EVERY PR in
[ci.yml](../../../../.github/workflows/ci.yml): the count-based lanes ride the
`go tests + fuzz` sweep, the ten time-boxed ones run as one sequential batch on
the `js tests + lint` runner, and `MION_FUZZ_ITER` widens the Go sweeps. `--soak`
is the release tier, run by the **`fuzz-soak` job** of
[release-gate.yml](../../../../.github/workflows/release-gate.yml) — one runner
per lane, on release PRs, on the push to `prod`, and on demand via
`gh workflow run release-gate.yml --ref <branch>` — or off the release path with
`gh workflow run fuzz-soak.yml`. Those jobs seed each lane from the run id and
echo the value, so a CI finding replays verbatim; the per-PR tier keeps the
version-derived seed instead, so a red lane belongs to that PR.

**Time-boxed vs count-based.** The `*_SOAK_MS` lanes (value, types, nondata,
roundtrip, size, cloning, elision, secbinary, secjson, secformat, secgen) fuzz against a wall clock, so CPU contention silently
buys them LESS coverage and they must never run concurrently. The rest are
count-based: fixed coverage, contention costs only wall clock. `miondevx` enforces
this for multi-lane runs, and both CI and the soak workflows schedule
accordingly.

## Reproducing a finding

Every lane derives its **entry seed from the package version** (`version.json`),
folded with the lane name, and prints it. No lane carries a pinned seed. That
makes a run reproducible within a release (a red build replays exactly, a green
one stays green) while every version bump rotates the ground the lanes explore.
`MION_FUZZ_SEED` overrides it everywhere.

The seed is printed at lane start, so a failing run carries its own replay
instructions:

```
[types-fuzz] seed 0xae14e729 from version 0.12.0 — replay: MION_FUZZ_SEED=0xae14e729 pnpm miondevx core fuzz types
```

Vitest only surfaces that line when the test fails, which is exactly when it is
needed. Every violation is ALSO logged with the per-iteration seed that produced
it. To replay:

- **Stateless fuzzers** (value / roundtrip / type / binary): set the base seed
  and a short soak so the runner re-derives the same stream, e.g.
  `MION_FUZZ_SEED=<seed> MION_FUZZ_TYPES_SOAK_MS=5000 pnpm exec vitest run typeFuzz.integration`.
- **Model-based fuzzers** (enrich / i18n / typemod): use the dedicated replay
  var, which re-runs that one sequence verbatim and shrinks it to the minimal
  reproducer — `MION_FUZZ_ENRICH_REPLAY=0x<seed>`, `MION_FUZZ_I18N_REPLAY=0x<seed>`,
  `MION_FUZZ_TYPEMOD_REPLAY=0x<seed>`.

Then fix the bug and **pin it**: add the minimal repro to
[`test/features/`](../features/) (stateless value/codec bugs) or a
`*.smoke.test.ts` here (type-shape bugs), and record the finding under
[`docs/done/`](../../../../docs/done/). That seed → replay → fix → pin loop is
why a feature can change and we still trust thousands of strange inputs keep
behaving.

## Running a soak round

A **round** is every lane that has a `--soak` budget, run on one fresh seed. Two
places do it:

- `pnpm miondevx core fuzz <lane> --soak` locally. Set `MION_FUZZ_SEED` to explore
  ground the current version does not reach, since an unset seed is derived from
  the version and so is the same every run within a release. Soak the lanes one
  at a time: the time-boxed ones lose coverage to contention, and a full local
  round is therefore the sum of the lane budgets.
- The **fuzz-soak** workflow, run by hand from the Actions tab or
  `gh workflow run fuzz-soak.yml`. Every soak lane in parallel, one runner each,
  a fresh seed derived from the run id, and a `lane` / `seed` pair of inputs so
  one finding replays on one runner. The release gate runs the same lanes on
  every prod PR. Both derive that lane list from the `FUZZ` registry
  (`pnpm miondevx core fuzz-lanes`), so giving a lane a soak budget is all it takes
  to enrol it in both.

Rounds are worth running between releases, not only when a release forces one:
these budgets are the only place the lanes explore new ground, so skipping them
banks up findings until the worst possible moment.

## Environment variables

The authoritative list is the `REGISTRY` in
[`scripts/lib/env.mjs`](../../../../scripts/lib/env.mjs) (`pnpm run check:env`);
all fuzz knobs are `dev`-scoped with sensible defaults.

| Variable                                                                       | Effect                                                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `MION_FUZZ_SEED`                                                               | Entry seed for ANY run; unset derives one from the package version      |
| `MION_FUZZ_SOAK_MS`                                                            | value fuzz soak duration (ms)                                           |
| `MION_FUZZ_TYPES_SOAK_MS`                                                      | type fuzz soak duration (ms)                                            |
| `MION_FUZZ_NONDATA_SOAK_MS`                                                    | non-data type fuzz soak duration (ms)                                   |
| `MION_FUZZ_CLONE_SOAK_MS`                                                      | clone fuzz soak duration (ms)                                           |
| `MION_FUZZ_ROUNDTRIP_SOAK_MS`                                                  | round-trip fuzz soak duration (ms)                                      |
| `MION_FUZZ_SIZE_SOAK_MS`                                                       | binary-size fuzz soak duration (ms)                                     |
| `MION_FUZZ_SECBINARY_SOAK_MS`                                                  | security fuzz, binary decoder bytes (ms)                                |
| `MION_FUZZ_SECJSON_SOAK_MS`                                                    | security fuzz, JSON decoders + parse (ms)                               |
| `MION_FUZZ_SECFORMAT_SOAK_MS`                                                  | security fuzz, format validators + patterns (ms)                        |
| `MION_FUZZ_SECHTTP_SOAK_MS`                                                    | security fuzz, hostile requests at the mion router + node adapter (ms)  |
| `MION_FUZZ_ENRICH_SEQUENCES` / `_MAXCMDS` / `_REPLAY`                          | enrich fuzz: sequence count / commands per sequence / replay one seed   |
| `MION_FUZZ_I18N_SEQUENCES` / `_MAXCMDS` / `_REPLAY`                            | i18n fuzz: same three knobs                                             |
| `MION_FUZZ_TYPEMOD_SEQUENCES` / `_MAXSTEPS` / `_REPLAY` / `_REPORT` / `_DEBUG` | type-mod fuzz: sequences / steps / replay / print stats / verbose diffs |
| `MION_FUZZ_RACE` / `_RACE_ITERATIONS` / `_RACE_FANOUT`                         | enable + tune the enrich race test                                      |

## Oracle catalog

Grouped by mode.

| Mode                      | IDs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| value / type (value tier) | **O1** valid-accepted · **O2** invalid-rejected · **O3** validate-total · **O4** errors-agree · **O5** json-stable · **O6** binary-stable · **O7** encode-total · **O10** refusal-has-reason · **O12** json↔binary agree · **O14** encoders-agree-on-serialisability                                                                                                                                                                                                                                                                  |
| type (build tier)         | **TR1** resolver-clean · **TR2** every-site-resolved · **TR3** every-module-evaluates · **TR4** every-factory-materialises                                                                                                                                                                                                                                                                                                                                                                                                            |
| roundtrip                 | **RT-VALIDATE** · **RT-AGREE** · **RT-STABLE** · **RT-FAILAGREE** · **RT-NATIVE** · **RT-THROW**                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| binary size               | **O-SIZE-NOGROW** · **O-SIZE-ROUNDTRIP** · **O-SIZE-GREW**                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| cloning                   | **O15** clone-reference · **O16** clone-isolation · **O17** clone-consistency                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| security / binary         | **SB-THROWS** decode returns or throws an Error · **SB-BOUNDS** index never past the buffer on return · **SB-TOTAL** validate(decoded) is a boolean, an accepted value re-encodes · **SB-REJECT** ruled-out bytes never validate · **SB-TIME** decode inside its budget · **SB-ISOLATION** the valid wire still round-trips after every attack · **SB-OOM** heap cap or hang, as a crash record · **SB-PROTO** sane prototypes and no inherited keys on the decoded value                                                             |
| security / generated code | **GC-PARSE** the body compiles as strict JS · **GC-TEXT** no raw control byte or line terminator · **GC-INJECT** a planted marker never escapes its literal · **GC-REBUILD** key-writing loops onto a fresh object carry the prototype-name guard, no Object.assign · **GC-COUNT** binary counts go through desCount / desCountU32 · **GC-REGEXP** every new RegExp( takes a build-time literal · **GC-ACCESS** no bare non-identifier property access · **GC-GUARD** a JSON decoder checks the wire shape before it converts a value |
| security / JSON           | **SJ-PARSE** parse throws only RTParseError · **SJ-REJECT** ruled-out payloads never get through parse or validate · **SJ-PROTO** sane prototypes, no inherited enumerable keys, on every decoded value and its exact-shape clone, and no encoder writes a prototype-named key onto the wire · **SJ-GLOBAL** Object/Array/Function prototypes untouched · **SJ-TOTAL** validate(decoded) is a boolean · **SJ-TIME** every call inside its budget                                                                                      |
| security / formats        | **SF-TOTAL** returns a boolean, never throws · **SF-TIME** one validator call under 250 ms · **SF-PATTERN-TIME** the same per registered pattern regex                                                                                                                                                                                                                                                                                                                                                                                |
| security / http (router)  | **SH-ALIVE** the router and the process still answer after every attack · **SH-ENVELOPE** a well-formed envelope, a token x-rpc-error header, nothing internal on a thrown error · **SH-NO5XX** malformed input never yields a 5xx · **SH-NOLEAK** no engine text or file path in a response · **SH-TIME** one request inside its budget · **SH-PROTO** Object.prototype untouched                                                                                                                                                    |
| enrich (model)            | **R1/R2/R3/R5/R6/R7a/R8/R10**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| i18n (model)              | **T1/T2/T3/T4/T5/T6/T7/T10**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| type-mod (model)          | **NL** nothing-lost · **RC** rename-carry · **CB** content-blind · **R6** convergence · **R10** totality · **P** parse-safety                                                                                                                                                                                                                                                                                                                                                                                                         |

</content>
</invoke>
