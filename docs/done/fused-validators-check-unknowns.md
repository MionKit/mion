---
type: feature
spec: guidelines
status: done
created: 2026-08-30
completed: 2026-08-31
---

# Fused validators: checkUnknowns

Strict validation used to cost two compiled functions run back to back:

```ts
const isUser = createValidateFn<User>();
const hasExtraFast = createHasUnknownKeysFn<User>(undefined, {runsAfterValidation: true});
const isUserStrict = (d: unknown): d is User => isUser(d) && !hasExtraFast(d);
```

Two walks of the value, every nested object visited twice. `createValidateFn` and
`createGetValidationErrorsFn` now take `{checkUnknowns: true}` and emit ONE
function that checks properties and undeclared keys in a single pass.

```ts
const isUserStrict = createValidateFn<User>(undefined, {checkUnknowns: true});
```

## What shipped

**Two new families, `vst` and `vest`** (`validateStrict` /
`validationErrorsStrict` in the operations registry), not a `ValidateOptions`
variant. Each embeds its plain twin's emitter and overrides nothing; the
difference is spliced into the shared object arms
(`emitObjectValidate`, `emitObjectValidationErrors`) behind
`ctx.ChecksUnknownKeys()`. See
`ts-go-runtypes/internal/cachegen/typefunctions/validate_strict.go`.

The call site's marker still says `'val'` / `'verr'`. The scanner swaps the
operation when it reads the flag (`computeSiteFn`,
`internal/compiler/resolver/scan.go`), so no marker type changed and the fused
families inherit `noLiterals` / `numberMode` / `rejectCircularRefs` unchanged.

**The key check is placed AFTER each object's property checks.** That ordering is
the actual win: every declared property is known present by the time it runs,
which is exactly the precondition that makes the O(1) `countEnumKeys` compare
sound. Standalone callers can only promise that at the root (via
`runsAfterValidation`); here it holds at every depth. Shapes with optional props
or non-RT children fall back to the key-list scan; index-signature shapes take no
check at all, since every key matching the index IS declared.

**Error order changed, deliberately.** `verr(v).concat(uke(v))` groups every type
error ahead of every unknown-key error. One walk cannot produce that grouping, so
the fused report interleaves per node in walk order, like every other error
family. Documented and pinned by test.

## Two design reversals worth recording

The original spec proposed a generic multi-family traverser as phase 1. It was
investigated and rejected, twice over:

1. **A generic multi-emitter traverser does not work.** `CompileChild` dispatches
   through the walker's single `Emitter`, so on a fused walker a child comes back
   as one already-fused string. The two arms need it differently, validate as an
   `&&` term and unknown-keys as a `||` term, and one string cannot be split back
   into two. The arms also disagree on a `CodeNS` child (validate poisons the
   object, unknown-keys skips it).
2. **So there is no traverser at all.** Giving the fused family one uniform
   meaning per node ("valid AND clean", a single boolean) inverts the `||` into
   the `&&` chain, and the only emit difference left is a spliced key check. An
   embed plus a marker interface covers it. No walker or module plumbing was
   needed.

The blocker that forced families over variants: **no variant entry is
disk-cached** (both the read and the write in `module.go` are gated on
`variantSuffix == ""`), variant walkers keep the plain family's `InnerPrefix` so
children dispatch to plain entries, and overrides skip variants. A variant would
have left every NAMED nested type unchecked, which is the common shape.

## FnHashLen 3 to 4, and the bug it caused

Registering the two operations tripped the collision guard:
`"validationErrors|NAM"` and `"validateStrict|~C"` both hashed to `"Vtr"`.
Bumping is the remedy the guard itself prescribes, and renaming an operation to
dodge a collision is explicitly what it forbids. The cost is a one-time churn of
every emitted cache key, which invalidates on-disk caches and the generated TS
mirror. Consumers that resolve through `getFnHash` (mion's `JIT_FUNCTION_IDS`)
picked the new values up with no edit, which is what that indirection was for.

**What the bump broke.** `FN_HASH_LEN` in
`packages/ts-runtypes/src/runtypes/entryTuple.ts` is a HAND-WRITTEN mirror of the
Go constant, with no generation and no drift guard. Bumping only the Go side left
the JS side slicing 4-char hashes to 3:

```ts
if (runTypeId !== undefined) key = key.slice(0, FN_HASH_LEN) + '_' + runTypeId;
```

That builds a key nothing is registered under, the lookup misses, and the factory
degrades to the family noop — a validator returning `true` for every input. Only
the value-first form (`createValidateFn(schema)`) rebuilds the key, so the type
form kept working and hid it completely.

Every hand-written test passed. The **fuzz lane caught it**: O2 (a corrupted value
must be rejected) failed on hundreds of seeds. It is now pinned by `fnHashLength`
in `packages/ts-runtypes/test/features/getFnHash.test.ts`, which asserts the
constant against the generated table, so the next bump fails loudly instead.

## Tests

- `internal/compiler/resolver/check_unknowns_test.go` — routing, emit shape (count
  compare vs scan vs no check), option composition, and the load-bearing case: a
  fused entry is rendered for a NESTED NAMED type, which a variant could not do.
  Includes the Marker coverage rule (both `getRunTypeId` shapes, paired, plus the
  hash-equivalence assertion).
- `packages/ts-runtypes/test/features/checkUnknowns.test.ts` — behaviour plus a
  parity oracle against the two-call composition, and the error-order pin.
- **O18 `fused-agree`** in `packages/ts-runtypes/test/fuzz/value/fuzzOracle.ts` —
  compare-to-a-trusted-source: the fused validator must equal
  `validate(v) && !hasUnknownKeys(v)` for every generated value, across the valid,
  invalid and junk phases. It earned its keep on the first run by catching the
  `FN_HASH_LEN` regression above.
- `fnHashLength` in `getFnHash.test.ts` — the Go/TS constant pin (see above).

## Not built here

Phase 3 of the original spec, `createParseFn`, is now
[docs/todos/create-parse-fn.md](../todos/create-parse-fn.md), standing on its own.

The parity work also surfaced a pre-existing bug in `createUnknownKeyErrorsFn`
(no object guard at the root: it throws on `null` and invents one entry per
character index on a string). Delegated as
[docs/todos/unknownkeyerrors-no-object-guard.md](../todos/unknownkeyerrors-no-object-guard.md).

Still open from the original spec's out-of-scope list: making
`runsAfterValidation` reach past the root object on the standalone
`createHasUnknownKeysFn`, tracked in
[docs/todos/hasunknownkeys-fastpath-named-nested-types.md](../todos/hasunknownkeys-fastpath-named-nested-types.md).
