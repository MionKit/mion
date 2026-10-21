---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# Wire or remove the strip decoder's noop predicate

## Intent

The Go resolver keeps a "this family does nothing for this type" predicate for the unknown-keys families (`isNoopForUnknownKeys` in `ts-go-runtypes/internal/cachegen/typefunctions/noop_types.go`, with a spec row `stripUnknownKeysWireSpec` and a `mapSetAlwaysNoop` knob made for the `stripUnknownKeysWire` family). `TestNoopType_UnknownKeys` pins its answers for `uku` and `ukuw`.

But no registered family runs it. `StripUnknownKeysWireEmitter` (the pre-pass of the `strip` JSON decoder, `strip_unknown_keys_wire.go`) has no `IsNoopType` method, and `UnknownKeysToUndefinedEmitter`, which has one, is not a registered family: it only serves as the delegate the wire emitter wraps. `deadcode ./cmd/...` lists `isNoopForUnknownKeys`, `unknownKeysNoopRecursive`, `unknownKeysNoopObject`, `unknownKeysNoopIndexSignature`, `unknownKeysNoopUnion` and the `UnknownKeysToUndefinedEmitter` `Supports` / `IsNoopType` / `NoopChildComposesAround` / `DiagCodeFor` methods as unreachable.

So either the `strip` decoder is missing a noop elision it was meant to have (a size and speed win on types with nothing to strip), or the predicate and its tests are leftovers. Found while removing `createHasUnknownKeysFn` / `createUnknownKeyErrorsFn`, the last two families that ran the predicate in production.

## Direction

The implementer plans the details. Decide between:

- **Wire it**: give `StripUnknownKeysWireEmitter` an `IsNoopType` using `stripUnknownKeysWireSpec`, and make sure the noop-predicate agreement corpus (`internal/compiler/resolver/noop_predicate_test.go`, `TestNoopPredicateAgreement`-style checks) and the renderer tripwire accept it. Compare generated decoder code before and after.
- **Remove it**: delete the predicate, the spec rows, the `factNoopUnknownKeysToUndefined` / `factNoopStripUnknownKeysWire` facts, the dead `UnknownKeysToUndefinedEmitter` methods and their tests.

Verify with `deadcode ./cmd/...` (golang.org/x/tools/cmd/deadcode) that nothing in this area stays unreachable.

## Docs

None, because the change is internal to the resolver and no user-facing behaviour or option changes.

## Done when

- The predicate runs for the `strip` decoder, or it is gone with its tests; no unreachable unknown-keys noop code remains.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm test` pass.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-24, delegated session)

Wire it. `stripUnknownKeysWire` is a registered family, and the predicate contract says every family implements `IsNoopType`; without it the walker never elides a noop child call and the renderer falls back to the root shape check.

- `StripUnknownKeysWireEmitter` gets `IsNoopType` (over `stripUnknownKeysWireSpec`) and `NoopChildComposesAround`.
- Drop `mapSetAlwaysNoop`: the wire emitter now walks the parsed Map/Set array (`emitNativeIterableUnknownKeys(..., wire=true)`), so "Map/Set is always noop" would be a false positive that skips a real strip inside a Map value or Set member.
- Remove what stays dead: `unknownKeysToUndefinedNoopSpec`, `factNoopUnknownKeysToUndefined`, and the `UnknownKeysToUndefinedEmitter` `Supports` / `IsNoopType` / `NoopChildComposesAround` / `DiagCodeFor` methods, plus the `UKU010` code only that `DiagCodeFor` could emit (regenerate the catalogs).
- Tests: `TestNoopType_UnknownKeys` drops the `uku` column and gains Map/Set rows; a new test asserts every registered family implements `NoopTypePredicate`; the resolver corpus (`TestNoopPredicateAgreement`) now compares `stripUnknownKeysWire`.
- Docs: none (internal). Fuzzing: not a feature.

## What shipped

- `StripUnknownKeysWireEmitter` implements `IsNoopType` + `NoopChildComposesAround`; `mapSetAlwaysNoop` is gone, so a Map value or Set member holding a keyed object is never elided.
- Dead pieces removed: `unknownKeysToUndefinedNoopSpec`, `factNoopUnknownKeysToUndefined`, the `UnknownKeysToUndefinedEmitter` `Supports` / `IsNoopType` / `NoopChildComposesAround` / `DiagCodeFor` methods, and the `UKU010` code (catalogs regenerated).
- Beyond the plan: the new `TestNoopType_EveryFamilyHasPredicate` guard also caught `jsonSchema` and `classSerializerReg`, which now answer `IsNoopType` with a plain `false` (they never render an identity body). `TestNoopPredicate_SoundAgainstEmitters` now reads `typefunctions.Families` instead of a hand-kept list that had drifted (it missed the strict and union-key validators), and gains `Map<string, Compat>` / `Set<Compat>` samples; putting the old Map/Set rule back makes it fail as UNSOUND.
- `deadcode ./cmd/...` lists nothing in this area except `NoopPredicateAgreement`, the corpus-test surface.
- Not touched: the "five-family" wording in `unknownkeys_has.go` / `unknownkeys_errors.go`, whose files the unknown-key reporter removal deletes.
