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
