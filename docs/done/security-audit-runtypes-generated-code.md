---
type: fix
spec: guidelines
status: ready
created: 2026-09-03
---

# Security audit of RunTypes, including the generated code

## Intent

RunTypes turns types into JavaScript at build time: validators, JSON encoders and decoders,
binary encoders and decoders, cloners, parsers and mock generators. The decoders are the delicate
part. They take attacker-controlled input and run type transforms on it (`new Date(v)`,
`BigInt(v)`, `new RegExp(src, flags)`, `Temporal.X.from(v)`, `JSON.parse(s)` for `any`), and the
binary decoder parses an ArrayBuffer by hand with no JSON in between. The audit has two halves:
read the emitters and runtime helpers, and read a corpus of the code they generate, because the
hole can be in the template rather than in any hand-written file.

The spike that produced this doc verified the problems listed below by running code.

## Verified findings

1. **Unbounded counts and lengths in the binary decoder.** `desLength()` in
   `packages/run-types/src/runtypes/dataView.ts:686` accepts any varint width and returns values
   past 2^32. The array arm of the emitter (`ts-go-runtypes/internal/cachegen/typefunctions/binary_from.go:282-285`) does `new Array(len)` and loops `len` times; the index-signature and
   tuple-rest arms (`:326-333`, `:535-536`, `:585-608`) loop the same way. A `string[]` decoder
   given the varint for 2^31 and no further bytes killed the process with
   `FATAL ERROR: invalid table size Allocation failed - JavaScript heap out of memory`; 2^24 made a
   16 million element array of empty strings in four seconds. Every count must be checked against
   the bytes left in the buffer before allocating or looping (an element needs at least one byte).
2. **Out-of-range reads are silent.** `desLength()` and `desString()` (`dataView.ts:686-707`) read
   through a `Uint8Array`, which returns `undefined` past the end. The varint loop treats that as
   zero and `subarray` clamps, so a truncated buffer decoded `["hello","world","a"]` and a string
   declaring more bytes than exist decoded to the bytes present. Reads that go through the
   `DataView` (`desFloat64`, `desByte`, `desU16`, `desI32`) do throw a `RangeError`, so today the
   failure mode depends on the element type. Make every read throw one typed decode error on a
   short buffer, and consider `new TextDecoder('utf-8', {fatal: true})` (`dataView.ts:76`) so
   invalid UTF-8 is rejected rather than replaced.
3. **Type transforms throw raw engine errors on bad input.** Checked on the JSON decoder:
   `BigInt('12x')` throws `SyntaxError`, `BigInt(1.5)` throws `RangeError`, a RegExp with flags
   `zz` throws `SyntaxError`, a RegExp arm given a number throws `TypeError: v.r.match is not a function` (`json_restore.go:114`), and the binary RegExp arm (`binary_from.go:134`) behaves the
   same. `new Date('garbage')` does not throw but yields an Invalid Date that the decoder returns
   as-is (`json_restore.go:126`); `createValidateFn` does reject it afterwards. Decide the
   decoder contract per family (decoders assume validated input, or decoders reject) and make the
   generated code honour it uniformly; `createParseFn` already promises an `RTParseError` and
   nothing else (oracle O19 in `packages/run-types/test/fuzz/value/fuzzOracle.ts:370`).
4. **A decoded RegExp is attacker-chosen.** A `RegExp` property on a decoded type accepts any
   pattern, including ones that backtrack catastrophically (`/(a+)+$/` decoded fine on both
   roads). The sidecar's 250 ms match budget (`packages/go-be-sidecar/src/jobs.ts:113`) only
   guards format patterns at build time. Decide whether wire RegExps should be limited (length,
   flags, a lint or build warning on the type) and document it.
5. **Prototype-named keys.** The binary decoder guards index-signature keys with
   `desSafePropName()` (`dataView.ts:708-717`, rejects `__proto__`, `prototype`, `constructor`).
   The JSON decoders do not: the in-place restore loop (`json_restore.go:291`) walks `for (const k in v)` over the parsed object, and the compact decoder and the clone encoder rebuild objects
   with `const _r = {}` and `_r[k] = …` (`json_compact_restore.go:235`,
   `json_prepare_safe.go:810`). Writing `__proto__` on a fresh `{}` swaps its prototype and the
   key vanishes from `Object.keys`, so `{"__proto__": {"admin": true}}` can produce an object
   whose `admin` is inherited. Audit every rebuild site; null-prototype objects or an own-key guard
   fix it.

## Direction

The implementer plans the details. Constraints and pointers that were checked:

- **Emitter map.** Everything lives in `ts-go-runtypes/internal/cachegen/typefunctions/`:
  `validate.go`, `json_prepare.go` / `json_prepare_safe.go` (encoders), `json_restore.go` and
  `json_compact_restore.go` (decoders), `json_composite.go` (the wrapper that calls
  `JSON.parse`), `binary_to.go` / `binary_from.go`, `clone_exact_shape.go`, `parse.go`,
  `class_serializer.go` (which does `JSON.parse(desString())` then `deserializeClass`), and
  `quote.go` (all string literals in emitted code go through `internal/jsquote`). Read
  `ts-go-runtypes/CLAUDE.md` first; `third_party/` is off limits.
- **Inspect the generated code, not only the templates.** Build a corpus: the random type
  generator in `packages/run-types/test/fuzz/core/typeGen.ts` plus a hand-written set of nasty
  types (property names with quotes, backslashes, newlines and unicode; literal types with the
  same; enum members; template literal types; format patterns; `rt$errors` templates from a
  FriendlyText mirror; index signatures with key patterns). Emit every family for every type,
  then scan the emitted JavaScript with a checklist: every literal quoted through the one helper,
  no raw `%s` of type-derived text (`module.go:1056` and `walker.go:598` were the only raw
  `Sprintf` sites found, both non-attacker), no object rebuild that writes wire keys onto a plain
  `{}`, every count checked before allocation, every `new Function` fed only build-time code.
  Turn the checklist into a test that runs over the corpus so the audit repeats on every change.
- **Build-time trust.** Generated code is materialized with `new Function`
  (`packages/run-types/src/runtypes/rtUtils.ts:298-310`). Its inputs are the emitter output and
  the disk cache under `node_modules/.cache/mion`. Confirm the cache is keyed by content and that
  a tampered cache file cannot be executed without the resolver regenerating it; same for the
  enrichment mirror files under the gen dir, which are user-editable and flow into messages.
- **Validate is the one total function today.** Oracle O3 (`validate(anything)` returns a
  boolean, never throws) is already fuzzed. It has no depth bound: a deeply nested input on a
  recursive type overflows the stack. Decide whether a bound belongs in the validator.
- **Shipped format regexes.** Only seven literal patterns live under
  `packages/run-types/src/formats/` (`string-formats-pure-fns.ts:350-531` and siblings); the rest
  are matched by hand-written code. Check each literal for catastrophic backtracking with a pump
  string and pin the result.
- **`any` / `unknown` / `object` arms** pass the parsed value straight through on the JSON road and
  `JSON.parse` a wire string on the binary road (`binary_from.go:81`). Note it in the contract; a
  consumer must know these fields are unvalidated.
- **Docs.** One page in `container/website/content/02.runtypes/` states the decoder contract in
  plain words: what a decoder checks, what it never checks, what it throws, and that `parse` is
  the safe entry point for untrusted input. Follow `container/website/CLAUDE.md`.

## Done when

- Findings 1, 2 and 5 are fixed and each pinned by a test with the crafted input.
- Findings 3 and 4 have a decided, documented contract and the generated code follows it, with a
  test per family.
- The generated-code corpus scan exists as a test and is clean.
- The website documents the decoder contract.
- Every extra finding surfaced by the audit is fixed in the same PR or delegated to a parallel
  session.

## Plan (approved 2026-09-03)

Decisions taken before building:

- **RegExp is not data.** A RegExp-typed value is treated exactly like a function: dropped from
  `DataOnly<T>`, skipped as an object property with the existing drop Warning, an Error at a root,
  array, tuple, record or union position. `validate` keeps `instanceof RegExp`. Format patterns
  are unaffected. Own commit, first.
- **Finding 3 keeps the earlier contract**: a wrong-shape wire value is left for validate; a
  well-formed value with bad content may make a plain decoder throw the engine error; `parse`
  turns any throw into `RTParseError`. Pinned per kind on both roads.
- **Depth**: no walker change. `parse` maps a `RangeError` escaping its validate phase to
  `RTParseError`; `validate` keeps throwing, documented.
- **Unsafe keys**: `__proto__`, `prototype` and `constructor` are refused as wire keys on both
  roads with one message, refused by validate under an index signature, and skipped by every
  rebuild loop. A type declaring one of the three names is a build Error.
- **Format-pattern slow-shape check** filed as its own guidelines todo.
- **Benchmarks** run before and after: serialization, validation with the Atomic group, the
  router binary buffer bench, two runs each, noise band recorded.

## Shipped

- **RegExp leaves the wire.** `KindRegexp` joins `IsNotSupportedKind` and the stripped union
  members; the nine value arms are gone from every codec and the cloner (a RegExp is shared by
  reference on `cloneExactShape` like a function); `DataOnly<RegExp>` is `never`; the mock
  generator makes one only under `nonDataTypes`; catalog messages no longer list RegExp among
  the natives. The fuzz generator moved `regexp` into its non-data block.
- **Finding 5.** One shared name set (`reflection.UnsafePropertyNames`; the JS side inlines
  the same three names). Every guard checks the key's length first (9 or 11) and compares
  strings only then. The strip and preserve decoders throw
  `[mion] Unsafe property name: <key>` from their index-signature loop; the binary decoder's
  `desSafePropName` throws `BinaryDecodeError` with the same text; `validate` and
  `validationErrors` refuse the key under an index signature; the rebuilding encoders (safe
  and compact) and `cloneExactShape` skip it, since they write wire keys onto a fresh object.
  The in-place encoders (mutate, stringify, binary) carry no guard on purpose: they never write
  a key onto another object and the receiving decoder refuses the key. `deserializeClass` no
  longer walks wire keys at all: the emitter hands it the class's declared property names and
  it sets only those. A declared property with one of the names is `UPN001` (Error). The secjson
  lane's prototype oracle now runs over the encoders and clone too (`SJ-PROTO`), and the binary
  lane got `SB-PROTO`.
- **Strip inside Map and Set.** Found by the widened `SJ-PROTO`: the wire-side strip pass skipped
  Map values and Set members, so an undeclared key on an object inside them rode through. The
  wire arm now walks the array form.
- **Finding 2, second half.** `TextDecoder('utf-8', {fatal: true})`; every short read on the
  binary road surfaces as `BinaryDecodeError` (the decoder wrapper maps `RangeError`).
- **Finding 3 pinned.** `jsonDecodeBadContent.test.ts` and `binaryDecodeBounds.test.ts` cover
  Date, bigint, the Temporal kinds, Map, Set, the union envelope and a registered class. One hole
  found and closed: `BigInt('')` is `0n`, so a bigint is now rebuilt only from a whole-number
  string (`/^-?[0-9]+$/`) on both roads; anything else is left for validate.
- **Depth.** `parse` reports a stack overflow as `RTParseError` (nested too deep).
- **Extra findings.** `jsquote` escapes C0 controls, DEL and U+2028/U+2029; the enrichment
  scaffold and mirror merge quote keys through it and share `reflection.IsSafeName`; a bigint
  format param that is not a whole number is `FMT002`; the disk cache states its trust line.
- **Corpus scan.** Seven generated-code oracles (`GC-PARSE`, `GC-TEXT`, `GC-INJECT`,
  `GC-REBUILD`, `GC-COUNT`, `GC-REGEXP`, `GC-ACCESS`), each with a negative control, run by a
  hand-written nasty corpus in `test/features/generatedCodeAudit.test.ts` and by the new
  `secgen` fuzz lane (`pnpm miondevx core fuzz secgen`, `MION_FUZZ_SECGEN_SOAK_MS`).
- **Docs.** `Decoding Untrusted Input` on the runtypes guide, linked from the JSON and binary
  serialization pages.

### Benchmarks

Two runs per side on the same host, geometric means over the suite's cases; the noise column is
half the spread between the two runs of a side.

### Serialization (geometric mean over cases, encode / decode per strategy)

| Case | Before (ops/s) | After (ops/s) | Delta | Run-to-run noise |
| --- | --- | --- | --- | --- |
| ALL · binary · decode | 1.33 M | 1.29 M | -2.4% | ±2.7% |
| ALL · binary · encode | 0.82 M | 0.83 M | +0.6% | ±0.5% |
| ALL · clone · decode | 2.23 M | 2.21 M | -1.1% | ±0.5% |
| ALL · clone · encode | 2.90 M | 2.90 M | -0.3% | ±1.2% |
| ALL · compact · decode | 2.48 M | 2.44 M | -1.3% | ±1.2% |
| ALL · compact · encode | 2.97 M | 3.00 M | +0.9% | ±0.6% |
| ALL · direct · decode | 1.93 M | 1.92 M | -0.5% | ±1.1% |
| ALL · direct · encode | 2.61 M | 2.59 M | -0.9% | ±1.6% |
| ALL · mutate · decode | 2.25 M | 2.21 M | -1.9% | ±0.9% |
| ALL · mutate · encode | 2.57 M | 2.54 M | -1.1% | ±0.4% |
| ALL · native JSON · decode | 3.59 M | 3.60 M | +0.1% | ±0.5% |
| ALL · native JSON · encode | 6.86 M | 6.72 M | -2.0% | ±1.7% |
| ATOMIC · binary · decode | 2.88 M | 2.81 M | -2.4% | ±3.6% |
| ATOMIC · binary · encode | 1.23 M | 1.26 M | +2.0% | ±3.4% |
| ATOMIC · clone · decode | 8.13 M | 8.13 M | -0.0% | ±0.8% |
| ATOMIC · clone · encode | 10.33 M | 10.55 M | +2.2% | ±1.1% |
| ATOMIC · compact · decode | 8.12 M | 8.09 M | -0.3% | ±2.4% |
| ATOMIC · compact · encode | 10.09 M | 10.42 M | +3.3% | ±0.8% |
| ATOMIC · direct · decode | 7.74 M | 7.79 M | +0.6% | ±1.5% |
| ATOMIC · direct · encode | 15.19 M | 15.78 M | +3.9% | ±1.7% |
| ATOMIC · mutate · decode | 8.18 M | 8.02 M | -1.9% | ±0.9% |
| ATOMIC · mutate · encode | 9.83 M | 9.83 M | +0.0% | ±1.9% |
| ATOMIC · native JSON · decode | 9.55 M | 9.48 M | -0.7% | ±0.3% |
| ATOMIC · native JSON · encode | 14.26 M | 14.60 M | +2.4% | ±2.0% |
| OBJECTS · binary · decode | 0.96 M | 0.93 M | -3.8% | ±4.7% |
| OBJECTS · binary · encode | 0.61 M | 0.62 M | +1.8% | ±7.5% |
| OBJECTS · clone · decode | 1.37 M | 1.40 M | +2.1% | ±2.4% |
| OBJECTS · clone · encode | 1.72 M | 1.66 M | -3.5% | ±2.4% |
| OBJECTS · compact · decode | 1.87 M | 1.76 M | -5.8% | ±4.6% |
| OBJECTS · compact · encode | 1.80 M | 1.75 M | -2.6% | ±4.3% |
| OBJECTS · direct · decode | 1.14 M | 1.12 M | -1.7% | ±4.3% |
| OBJECTS · direct · encode | 1.45 M | 1.39 M | -4.1% | ±2.3% |
| OBJECTS · mutate · decode | 1.40 M | 1.36 M | -2.5% | ±1.7% |
| OBJECTS · mutate · encode | 1.55 M | 1.50 M | -3.5% | ±1.0% |
| OBJECTS · native JSON · decode | 2.46 M | 2.44 M | -0.5% | ±4.6% |
| OBJECTS · native JSON · encode | 3.73 M | 3.48 M | -6.7% | ±4.3% |
| RECORDS · binary · decode | 0.71 M | 0.72 M | +1.5% | ±4.9% |
| RECORDS · binary · encode | 0.59 M | 0.60 M | +1.6% | ±7.4% |
| RECORDS · clone · decode | 2.01 M | 1.92 M | -4.5% | ±1.0% |
| RECORDS · clone · encode | 2.79 M | 2.71 M | -3.1% | ±3.1% |
| RECORDS · compact · decode | 1.78 M | 1.85 M | +3.6% | ±2.9% |
| RECORDS · compact · encode | 2.64 M | 2.75 M | +4.0% | ±5.3% |
| RECORDS · direct · decode | 1.28 M | 1.33 M | +4.1% | ±2.6% |
| RECORDS · direct · encode | 1.27 M | 1.23 M | -3.6% | ±6.1% |
| RECORDS · mutate · decode | 2.02 M | 1.88 M | -6.7% | ±2.3% |
| RECORDS · mutate · encode | 3.84 M | 3.66 M | -4.8% | ±3.8% |
| RECORDS · native JSON · decode | 2.45 M | 2.52 M | +2.9% | ±3.9% |
| RECORDS · native JSON · encode | 5.83 M | 5.73 M | -1.6% | ±2.3% |

### Validation (geometric mean over cases)

| Case | Before (ops/s) | After (ops/s) | Delta | Run-to-run noise |
| --- | --- | --- | --- | --- |
| ALL · validate · invalid input | 21.55 M | 21.55 M | +0.0% | ±0.7% |
| ALL · validate · valid input | 14.38 M | 14.44 M | +0.5% | ±0.6% |
| ALL · validationErrors · invalid input | 6.22 M | 6.11 M | -1.9% | ±0.9% |
| ALL · validationErrors · valid input | 12.08 M | 11.86 M | -1.8% | ±0.4% |
| ATOMIC · validate · invalid input | 59.75 M | 60.46 M | +1.2% | ±0.8% |
| ATOMIC · validate · valid input | 33.28 M | 33.34 M | +0.2% | ±0.7% |
| ATOMIC · validationErrors · invalid input | 14.15 M | 14.12 M | -0.2% | ±1.7% |
| ATOMIC · validationErrors · valid input | 31.00 M | 31.22 M | +0.7% | ±0.6% |
| NATIVE · validate · invalid input | 66.65 M | 67.42 M | +1.1% | ±0.6% |
| NATIVE · validate · valid input | 32.41 M | 32.19 M | -0.7% | ±3.8% |
| NATIVE · validationErrors · invalid input | 11.31 M | 12.30 M | +8.7% | ±1.7% |
| NATIVE · validationErrors · valid input | 25.89 M | 26.78 M | +3.4% | ±2.3% |
| OBJECT · validate · invalid input | 46.54 M | 45.99 M | -1.2% | ±0.4% |
| OBJECT · validate · valid input | 27.41 M | 27.22 M | -0.7% | ±0.4% |
| OBJECT · validationErrors · invalid input | 9.51 M | 8.69 M | -8.6% | ±1.8% |
| OBJECT · validationErrors · valid input | 21.37 M | 18.98 M | -11.2% | ±1.3% |

### Router binary buffer (throughput)

| Case | Before (ops/s) | After (ops/s) | Delta | Run-to-run noise |
| --- | --- | --- | --- | --- |
| core-hybrid (throughput) | 217 | 221 | +1.9% | ±6.3% |
| per-route-merge (throughput) | 237 | 253 | +7.0% | ±8.4% |
| single-exact (throughput) | 232 | 228 | -2.0% | ±8.7% |
| hybrid-straddle (throughput) | 230 | 209 | -9.1% | ±8.1% |
| core-hybrid STEADY (throughput) | 1528 | 1470 | -3.8% | ±8.3% |
| single-exact STEADY (throughput) | 1442 | 1356 | -5.9% | ±3.5% |
| hybrid-straddle STEADY (throughput) | 1506 | 1533 | +1.8% | ±3.8% |

Everything sits inside the run-to-run band except two rows, both understood:

- **`OBJECT · validationErrors` is down 11%**, all of it from two cases, `index_signature_nested`
  and `index_signature_date_value` (12.7 to 2.6 M/s each). Both are a two-level record whose
  `validationErrors` body sat just under V8's inlining budget on main; the unsafe-key guard adds
  one error call per loop, the function stops being inlined into the benchmark's caller, and the
  per-call allocation it used to elide comes back. Measured with the exact emitted bodies: any two
  extra call sites (even two dead ones) cost the same 5x, one does not, and a compare-and-continue
  without a call is free. The same type with a four-field object as its leaf runs at the same
  speed with and without the guard (1.9 M/s both), so any realistic type is already past that
  cliff on main. `validate` on the same cases is unchanged (its guard is a bare `return false`).
- **Binary decode is 2% lower overall**, inside the band but consistent: `TextDecoder` in fatal
  mode is about 10% slower on short non-ASCII strings (8 to 40 bytes), equal on ASCII and on long
  strings. A non-fatal decode followed by a U+FFFD scan measured slower on ASCII, so fatal stays.

The router rows are noisy by nature (their band is 4 to 9%); four after-runs of the buffer bench
put every row inside the before-runs' spread.

