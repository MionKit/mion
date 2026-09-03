---
type: feature
spec: guidelines
status: done
created: 2026-09-03
updated: 2026-09-03
---

# Security fuzz lanes for the RunTypes decoders

## Intent

The existing fuzz harness (`packages/run-types/test/fuzz/`) is thorough about correctness on
valid input: round trips, strategy agreement, size estimates, cloning. What it does not do is act
as an attacker. No lane feeds random or mutated bytes to the binary decoder, and the value lane's
junk stream only checks that `validate` is total (oracle O3) while the decoders are only run on
conforming values (oracles O5, O6, O7, O19). The spike that produced this doc found, by hand, a
six-byte binary body that kills the process with an out-of-memory error and truncated buffers
that decode to garbage; a fuzzer would have found both in seconds. This todo adds the lanes that
hunt exactly that class of bug, using standard techniques: mutation of valid wires, structure
aware generation, and resource oracles.

## Direction

The implementer plans the details. Constraints and pointers that were checked:

- **Build on the shared core.** `core/runLoop.ts`, `core/seededRng.ts`, `core/crashGuard.ts`,
  `core/typeGen.ts` and the compile harness in `type/typeFuzzHarness.ts` /
  `roundtrip/roundtripHarness.ts` give seeded replay, crash capture and one compiled factory per
  family for a random type. Follow the README's rule: real shipped types, imported, never copied.
- **Lane 1, binary decoder bytes.** For each random serialisable type, encode a conforming value,
  then feed the decoder (a) mutations of that wire: bit flips, byte substitution, truncation at
  every offset, duplication, inflated varints in length and count positions, swapped union tags
  and discriminants, and (b) pure random bytes and structured junk (varint for a huge count
  followed by nothing). Oracles: the decoder either returns a value that `validate` accepts or
  throws one typed decode error (never a raw `RangeError`, never `undefined` in a string slot);
  it never reads past the buffer silently; wall time and allocation are bounded by a small multiple
  of the input length; a valid wire still decodes after every mutated one (no shared state
  poisoning, the string cache in `dataView.ts` is a candidate). Run each decode in a child process
  or with a heap cap so an out-of-memory finding is a report with a seed, not a dead vitest
  worker.
- **Lane 2, JSON decoders and parse.** Same shape over the four decode strategies and
  `createParseFn`: start from a valid JSON wire and mutate the parsed tree (type confusion at one
  position, `__proto__` / `constructor` / `prototype` keys at object positions, Invalid Date
  strings, bigint strings with junk, RegExp strings with bad flags or catastrophic patterns,
  numbers out of range, very deep nesting, very long strings and arrays). Oracles: `parse` throws
  only `RTParseError` (extends O19 to the mutated space); a decoder's result, when it returns, has
  `Object.prototype` or a null prototype at every object position and no inherited enumerable
  keys; nothing hangs past a time budget; the global `Object.prototype` is untouched after the run.
- **Lane 3, format patterns.** Pump strings against every shipped format validator and every
  regex literal under `packages/run-types/src/formats/`, with a time oracle, so a slow pattern is a
  finding.
- **Wire it in like every other lane.** A row in the `FUZZ` table in `scripts/miondevx.mjs` with
  quick and soak budgets, a `MION_FUZZ_<LANE>_SOAK_MS` row in the `REGISTRY` in
  `scripts/lib/env.mjs` and `.env.sample`, the CI partition in `.github/workflows/ci.yml`
  (time-boxed lanes run sequentially on the `js tests + lint` runner; the pin is
  `packages/devtools/test/fuzz-lane-contracts.test.ts`), and a section in
  `packages/run-types/test/fuzz/README.md` with the new oracle ids in the catalog.
- **Findings are fixes.** A red lane means the bug is fixed in the same PR with a seed-pinned
  repro under `test/features/` or a `*.smoke.test.ts`, per the README's replay loop. The known
  ones (unbounded counts, silent short reads) are expected to be fixed by the RunTypes audit; if
  that has not landed, the first run of lane 1 will find them and this PR fixes them.
- **Docs.** The fuzz README is the developer map and must describe the new lanes; the website
  needs no change unless a decoder contract changes.

## Done when

- Three new lanes run in `pnpm test` at a fixed budget and in the quick and soak tiers.
- Lane 1 demonstrably catches the out-of-memory and silent-truncation bugs when run against the
  pre-fix decoder (keep that as a negative control in a unit test, like `elisionOracle.unit`).
- A full soak round is clean, or every finding it produced is fixed and pinned.
- The README catalog lists the new oracles.

## Plan (approved 2026-09-03)

Two attack layers on every fuzzed type, both wires, `deserialize` as the main target:

1. **Blind, structure-level attacks**: byte mutation of valid binary wires (bit flips, substitution,
   truncation at every offset, duplication, varint inflation at every varint offset, tag swaps, random
   bytes, "huge varint then nothing") and tree mutation of valid JSON wires, with resource oracles
   (time, heap cap, bounds, isolation).
2. **A vulnerability dictionary** (`test/fuzz/security/attackDictionary.ts`): for every kind of data a
   decoder rebuilds, known and possible attacks with concrete payloads, tried at every position of
   that kind. It always includes the plain wrong-type values (a string in a number slot, `true` in a
   string slot, and every other pairing) and treats the union envelope as a first-class target
   (indexes outside the union, negative, float, string, `true`, null; envelope missing, short, long,
   not an array; a valid index with another arm's payload; discriminant missing, wrong, as array).
   Entries carry `expect: 'reject' | 'any'`; a rejected payload that `parse` accepts or that decodes
   into a value `validate` accepts is a finding. The report counts applications per entry and fails
   on an entry that was never exercised.

Positions come from walking the instantiated RunType graph next to the valid value. On the JSON wire
the payload is spliced at the path (prototype keys as JSON text, so they arrive as own keys). On the
binary wire a decode of the valid wire through an instrumented deserializer records every read's
offset and method, which is the wire map the byte payloads are spliced into.

Lanes: `secbinary` (heap-capped worker thread per decode batch, oracles SB-TYPED / SB-BOUNDS /
SB-TOTAL / SB-REJECT / SB-TIME / SB-ISOLATION / SB-OOM), `secjson` (SJ-PARSE / SJ-REJECT / SJ-PROTO /
SJ-GLOBAL / SJ-TYPED / SJ-TIME), `secformat` (SF-TOTAL / SF-TIME / SF-PATTERN-TIME). Negative controls
in the unit lane, including the pre-fix reader + pre-fix `string[]` decode body proving the truncation
and the count bomb are caught with a seed.

Fixes forced by the first runs, in this PR with pinned repros: bounds checks in `dataView.ts`
(`desLength`, `desString`, new `desCount` / `desCountU32` bounded by the bytes left, zero-byte items
capped), `createBinaryDecoderFn` throws `RTParseError` (deserialize arm) for any failure, the Go
emitter calls the bounded count readers with a per-kind minimum byte size. Any further finding is fixed
the same way; a contract decision goes to the user.

Benchmarks run before and after every fix (serialization, validation `bench-one mion` with the Atomic
group, the router binary buffer bench), twice on the untouched tree to measure noise; a drop beyond the
noise is fixed before pushing and the final table is recorded here.

## Shipped (2026-09-03)

Everything under `packages/run-types/test/fuzz/security/`, documented in the fuzz README.

**The lanes.** `secbinary`, `secjson`, `secformat`: registered in the miondevx FUZZ table
(quick 10 s / soak 60 s), the env registry (`MION_FUZZ_SEC{BINARY,JSON,FORMAT}_SOAK_MS`),
`.env.sample`, the ci.yml time-boxed step and sweep exclude list, and the fuzz-soak dispatch
options. They run in `pnpm test` at a fixed batch (20 / 40 types, 2 pump rounds).

**Two attack layers.** Blind mutation (bit flips, substitution, truncation at every offset,
duplication, insertion, varint inflation, random bytes, "huge varint then nothing"; random junk
subtrees on the JSON side) plus the vulnerability dictionary (`attackDictionary.ts`): per data
kind, listed attacks tagged with a vulnerability class and an `expect`, the generated wrong-type
matrix (every other kind at every position), and the union envelope as a first-class target.
Positions come from walking the type next to the parsed JSON wire (`positions.ts`); on the binary
side an instrumented deserializer records every read the compiled decoder makes, which is where the
byte payloads land (`wireMap.ts`, `wireMutations.ts`).

**Heap cap.** The binary lane runs decodes in a forked child process with `--max-old-space-size`.
A worker thread was tried first and rejected: the count bomb's failure mode is V8's FATAL
"invalid table size" allocation failure, which takes the whole process down regardless of a
thread's `resourceLimits`. The child posts the attack id before each decode, so an out-of-memory or
a hang is a crash record with the attack and seed.

**Negative control.** `prefixReader.ts` restates the pre-fix `desLength` / `desString` and the
pre-fix `string[]` arm; `securityOracle.unit.test.ts` runs them through the real child-process host:
the truncated wire lands as SB-BOUNDS (`["hello","world","a"]`) and the 2^31 count as an
out-of-memory crash record carrying seed 0xbeef and the attack id.

**Findings, all fixed in this change with seed-free repros under `test/features/`:**

| Finding | Fix | Repro |
| --- | --- | --- |
| Silent short reads: `desLength` / `desString` read `undefined` past the end and took it as zero | Bounds checks; a varint past 5 bytes or past the buffer, a string past the buffer throw `BinaryDecodeError` | `binaryDecodeBounds.test.ts` |
| Arms that consume without reading (the `null` / `undefined` sentinel byte, the optional-property bitmap) walked past the end silently, so a truncated buffer decoded to `null` or `{}` | `createBinaryDecoderFn` compares the index to the buffer once after the walk (the index only grows, so one compare catches every overrun) | `binaryDecodeBounds.test.ts` |
| Count bombs: a varint count was allocated before the bytes behind it were checked (a five-byte body exhausted the heap; `Record<string, RegExp>` from random bytes hung 10 s) | `desCount` / `desCountU32` refuse a count the bytes left cannot back; the Go emitter passes `minWireBytes` per element (`binary_min_bytes.go`); zero-byte items get `MAX_ZERO_BYTE_ITEMS` | `binaryDecodeBounds.test.ts`, `binary_min_bytes_test.go` |
| JSON restore loops trusted `.length` of a non-array: `{"length": 1e9}` at an array position looped a billion times, 8 GB heap | Every emitted element loop (arrays, rest tuples, Map/Set entries) behind `Array.isArray` | `jsonDecodeArrayGuard.test.ts` |
| Lenient coercion let `parse` accept values the type rules out: `null` → epoch Date, `true` → `1n`, `null` → empty Set / Map | Date / Temporal arms transform only strings, BigInt only strings and whole numbers (the one lenient spelling `parse` already promised in `parse.test.ts`), Map / Set only arrays; anything else throws a plain `Error` (`Can not json decode Date: expected an ISO date string`), the message hoisted once per factory the way the union decoder's is | `jsonDecodeWireForm.test.ts` |
| The compact decoder rebuilt an object from a bare number (an all-optional type accepted the resulting `{}`) | The positional object rebuild is behind `Array.isArray`, a non-array throws | `jsonDecodeWireForm.test.ts` |

**A lane bug worth recording.** The child process first picked "the" `fb` tuple by family tag; the
entry modules carry one per nested type, so for some types it attacked a nested decoder. The quick
tier's isolation oracle caught it (a re-encode came back 17 of 235 bytes). The parent now passes the
root call sites' tuple keys with the job. The mion framing (`bodyDeserializer.ts`) reads several
values from one buffer through the raw `fb` function, so it does not get the end-of-decode compare;
that check belongs in its own catch-all, with the mion audit.

**Decisions.** No try/catch wrapper on the decoders: they throw whatever the failing arm throws
(`BinaryDecodeError`, `SyntaxError` from `BigInt`, the engine's `TypeError`); `parse` stays the
typed entry point with its `RTParseError` promise (checked on every hostile input, SJ-PARSE). A
decoder throw is a histogram entry in the report, not a finding. A JSON restore arm that meets the
wrong wire form (a `null` where the Date string goes) throws a plain `Error` rather than leaving
the value for validate: the decoders are also used without `parse`, and a fail-fast at the arm
never hands validate a value it may or may not refuse. Not `RTParseError`: a typed decoder error
is a compile option of its own, and pre-wrapping at every arm would wrap the same error twice
once it lands. The message (`Can not json decode <what>: expected <wire form>`, the union
decoder's shape) is hoisted once per factory into the closure prologue, so the arm is the same
single `typeof` / `Array.isArray` with a bare `throw` on the cold branch. Nesting attacks stop at
256 levels; a validator depth bound is still the audit's decision. Those guards and the bounded
counts are the only cost added to hot paths (one `typeof` / one `Array.isArray` per Date, bigint,
Temporal, Map, Set and array decode; one compare per bounded count).

**Benchmarks.** The decoder numbers come from the host-side serialization generator
(`scripts/website/bench-data/gen-serialization.mjs`), run twice before and twice after the fixes.
(The container image pull failed at the time only because `pnpm miondevx container login` had not
been run; the CLAUDE.md container section now says so.) The validation Atomic suite was not
affected (no validator change).

Serialization benchmark, 147 cases per round-trip, decode and encode ops/sec, median change after
the fixes versus the two baseline runs, next to the run-to-run noise measured between the two
baseline runs on this shared machine:

| round-trip | decode change (median) | encode change (median) | run-to-run noise (decode / encode) |
| --- | --- | --- | --- |
| clone | -0.2% | +1.4% | 4.6% / 7.7% |
| mutate | +0.0% | -1.0% | 5.1% / 5.9% |
| direct | -0.5% | -0.7% | 5.4% / 9.2% |
| compact | -0.5% | -0.6% | 5.6% / 7.4% |
| binary | +0.7% | +1.0% | 6.4% / 7.3% |

Individual cases swing 20 to 40 percent in both directions between runs, on decoders whose code did
not change (a plain boolean, a small number) as much as on the guarded ones, so per-case deltas are
noise here and the medians are the signal: no measurable cost. What each guard costs by
construction: one `typeof` compare per Date / bigint / Temporal decode, one `Array.isArray` per
array, rest tuple, Map, Set and compact object decode, one multiply-and-compare per bounded count,
one bounds compare per varint byte and per string. The `desLength` single-byte fast path is
unchanged.

**Not covered here, still owed by the audit todos:** the generated-code corpus scan, the website's
decoder-contract page, mion's own binary framing (`bodyDeserializer.ts:28` reads a raw uint32 count),
and the RegExp-on-the-wire policy.
