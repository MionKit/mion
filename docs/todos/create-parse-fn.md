---
type: feature
spec: guidelines
status: ready
created: 2026-08-31
---

# createParseFn

## Intent

Getting a typed, validated value out of parsed JSON takes three compiled
functions and hand-written glue today: restore the JSON-shaped value, run the
boolean validator, and on failure run the error collector. Add
`createParseFn<T>()` (zod's `parse`) that does all three, fusing the work per node
instead of three walks.

Split out of [docs/done/fused-validators-check-unknowns.md](../done/fused-validators-check-unknowns.md),
which shipped the `checkUnknowns` half. Read that doc first: it settles the
design question this one inherits, and its answer was NOT what the original spec
assumed.

## Direction

Input is the output of `JSON.parse`, not a string, matching the `restoreFromJson`
contract, so it composes with `createJsonDecoderFn` rather than duplicating it.

**Follow the pattern `checkUnknowns` established, not a generic traverser.** That
was investigated and rejected: `CompileChild` dispatches through the walker's
single `Emitter`, so on a fused walker a child returns one already-fused string
that the arms cannot split apart. What worked instead was giving the fused family
ONE uniform meaning per node, then reusing the plain emitter behind a marker
interface (`StrictUnknownKeys` in
`ts-go-runtypes/internal/cachegen/typefunctions/validate_strict.go`) with the
difference spliced into the shared arms. Parse's uniform meaning is "restore this
node and return it, or signal mismatch".

**It must be a FAMILY, not a variant** — same reason: variants are root-scoped
(children dep-call the plain entry), are never disk-cached, and skip overrides.
The registration path is now worn in: an operation row, a `CacheModules` row, a
`Families` row, an `entryTuple.ts` `familyMeta` row, and the scanner swap in
`computeSiteFn`.

**Unknown keys ride the existing `strategy` option**, not a new one. `strategy` is
the established name for this axis on `createJsonEncoderFn` /
`createJsonDecoderFn`, with `AxisJsonStrategy` behind it, so `getFnHash`,
`Canonical` and the collision guard work with no new machinery. Suggested tokens:

- `strip` — DEFAULT, matching the decoder's own default and zod.
- `fail` — reject extras in the validation phase, reusing the shipped
  `validationErrorsStrict` arm.
- `preserve` — keep extras, for symmetry with the decoder.

Findings carried over, each verified while building `checkUnknowns`:

- **`strip` should not copy the decoder's `strip`.** That takes two walks
  (`"jsonDecoder|strip": {"rj", "ukuw"}`, `internal/constants/constants.go`), a
  set-undeclared-to-undefined pre-pass then a restore. The note above that line
  says what to do instead: `clone` is shape-derived, so it strips by construction
  and needs no separate pass. Same note records that `stripClone` / `stripMutate`
  were removed as redundant.
- **That rebuild is not a tweak to the restore walk.** `restoreFromJson`
  transforms IN PLACE and shares its object walk with the mutating
  `prepareForJson` (`emitObjectJsonChildren`, `typefunctions/json_prepare.go`), so
  extras survive it. The one decode-direction emitter that builds a fresh object
  from the declared shape is `emitObjectCompactFromJson`
  (`typefunctions/json_compact_restore.go`), rebuilding a keyed object slot by
  slot. Borrow that, reading by key not position.
- **Order at restoring leaves is correctness.** Check the JSON shape before
  restoring, or junk makes `BigInt(v)` throw a raw `TypeError` and `new Date(v)`
  yield an Invalid Date instead of a clean rejection.
- **The cold path should not be fused.**
  `packages/ts-runtypes/src/standard/createStandardSchema.ts` is the precedent:
  cheap boolean first, issues only on failure. Suggestion: hold soft deps on the
  PLAIN `rj` and `verr` entries and, on mismatch, restore the original input and
  run `verr` on that. Two extra walks on a path about to throw, in exchange for a
  report identical to `createGetValidationErrorsFn`'s.
- **New error class.** `CircularReferenceError`
  (`packages/ts-runtypes/src/runtypes/circular.ts`) is the only error class in the
  package; `RTParseError` carrying `issues: RTValidationError[]` follows it.

One thing to settle, not designed here: `DemandFor`'s `AxisJsonStrategy` arm
assumes a COMPOSITE (it looks up `JsonCompositeTag` and `JsonStrategyFamilies`,
`internal/cachegen/operations/demand.go`). Parse is a type-walking family with a
strategy axis, which that arm does not cover.

## Two traps this work will hit

Both cost real time on the `checkUnknowns` PR:

1. **Adding operations can trip the fnHash collision guard**, which fails at
   package init with a panic naming the two colliding keys. The remedy is bumping
   `FnHashLen` (`internal/cachegen/operations/fnhash.go`), never renaming an
   operation to dodge it. A bump churns every emitted cache key.
2. **`FN_HASH_LEN` in `packages/ts-runtypes/src/runtypes/entryTuple.ts` is a
   hand-written mirror of that Go constant** and must move with it. Getting it
   wrong is silent: `key.slice(0, FN_HASH_LEN)` truncates to a key nothing is
   registered under, the lookup misses, and the factory degrades to the family
   noop — a validator returning `true` for everything. Only the value-first form
   (`createValidateFn(schema)`) rebuilds the key, so the type form keeps working
   and hides it. It is now pinned by `fnHashLength` in
   `packages/ts-runtypes/test/features/getFnHash.test.ts`, so a bump fails loudly
   rather than silently.

## Tests

Follow the shape `checkUnknowns` used: Go resolver tests for routing and emit
shape (including a NESTED NAMED type getting its own fused entry, which is what
proves the family design), a JS behaviour suite, and the Marker coverage rule
(both `getRunTypeId` shapes, paired, plus a hash-equivalence assertion).

Fuzzing is a strong fit and the harness is ready: `checkUnknowns` added the O18
compare-to-a-trusted-source oracle in
`packages/ts-runtypes/test/fuzz/value/fuzzOracle.ts`, and parse has an even
better one, round-trip. Encode with `createJsonEncoderFn`, `JSON.parse`, feed to
`parseFn`, deep-equal against the original; plus a rejection oracle on mutated
payloads. O18 was worth its keep immediately, catching a real regression the
hand-written tests missed.

## Done when

Every strategy covered (`strip` leaves no undeclared key at any depth and
deep-equals `cloneExactShape(restore(v))`, `fail` rejects exactly what the shipped
`checkUnknowns` validator rejects, `preserve` keeps extras); `parse(v)`
deep-equals `restore(v)` on success and throws issues deep-equal to
`getValidationErrors(restore(v))` on failure; junk at every restoring leaf
(bigint, Date, Map/Set, tuple slots) rejects cleanly and never surfaces a raw
`TypeError`; the round-trip and rejection fuzz oracles hold; docs under
`container/website/sites/runtypes/content/02.guide/05.json-serialization.md` with
a pointer from `03.validation.md`, plus an example under
`packages/examples/src/guide/`; `pnpm test` and
`go -C ts-go-runtypes test ./internal/...` green.

## Out of scope

- `createSafeParseFn` returning `{success, data | issues}`. Worth having, its own
  todo.
- Taking a JSON string. `createJsonDecoderFn` owns that.
