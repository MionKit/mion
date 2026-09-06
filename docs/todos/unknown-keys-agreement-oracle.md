---
type: feature
spec: guidelines
status: ready
created: 2026-09-06
---

# Fuzz oracle: every unknown-key function gives one answer

## Intent

Four generated functions decide what an "unknown key" is, each with its own
emitter: `hasUnknownKeys` (`huk`), `unknownKeyErrors` (`uke`),
`unknownKeysToUndefined` (`uku`) and the JSON decoder's strip pre-pass
(`ukuw`). They have drifted from each other more than once, and always in the
same way: a position the merged-allowlist walk did not reach. A class member of
a union was the latest, found by hand while fixing the encode side; the root vs
union answers differed for strip, hasUnknownKeys and unknownKeyErrors alike.
Hand-written tests only cover the positions someone thought of. A fuzz oracle
covers the positions nobody thought of.

## Direction

One rule, checked on random types and random values:

- `hasUnknownKeys(v)` is true exactly when `unknownKeyErrors(v)` is non-empty.
- The paths `unknownKeyErrors` reports are exactly the keys
  `unknownKeysToUndefined` blanks, and exactly the keys the decoder's `strip`
  blanks on the encoded wire of the same value.
- A value with no extras is clean for all four; a value with one extra key
  planted at ANY depth is flagged by all four, with the same path.

The type generator must reach every position that has its own arm in the
emitters: root object, union member (object AND named class, registered or
not, base and subclass instance), nested property, array item, tuple slot, Map
value, Set member, index-signature object (the documented carve-out), and the
discriminated union with a shared literal key. Classes need the same
registration on both sides of the decoder round trip.

Extend the existing lane rather than starting one: the value fuzz under
`packages/run-types/test/fuzz/value/` already generates conforming values and
an extras stream, and `fuzz/cloning/cloneOracle.ts` shows the oracle shape
(properties, never expected outputs). Family keys live in
`packages/run-types/src/runtypes/entryTuple.ts`; the shared union walk all four
compile through is `emitUnionUnknownKeysMerged` in
`ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_union.go`.

The implementer plans the extras placement, the seeds and the budget; the
`fuzzy-testing` skill is the guide for the harness conventions.

## Done when

- A seeded fuzz run over the positions above reports no disagreement between
  the four functions, and a deliberately broken emitter (drop one arm) makes it
  fail on the first seed.
- The lane runs in the fuzz-unit config and in CI's fuzz job like its siblings.
