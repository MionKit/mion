---
type: feature
spec: guidelines
status: ready
created: 2026-09-03
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
