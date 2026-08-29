---
type: fix
spec: guidelines
status: done
created: 2026-08-29
---

# A Buffer column cannot be reflected on the ESNext lib (MKR009)

## Intent

On a project compiled against the ESNext lib, reflecting a type whose data reaches Node's `Buffer`
failed the build outright. It surfaced on the drizzle type road, where `tableFromType<T>()` is the one
call that asks the resolver to reflect a whole table type:

```
tests/sqlite/sqlite-common.ts(33,28): error MKR009: Type `IteratorObject` re-instantiates itself
with fresh type arguments at every level (a self-instantiating generic), so its structural id never
resolves. Reflect a monomorphic shape instead.

Error: @ts-runtypes/devtools: 1 unsupported-type error — build halted.
```

The table at that call site is drizzle's `all_types`, whose only exotic column is
`Blob<'buffer', {mode: 'buffer'}>`, and the data type of that column is `Buffer`. On the ESNext lib
`Uint8Array`'s iterator methods return `IteratorObject`, which is a self-instantiating generic, so
the walk never terminates and MKR009 refuses it.

This was not a drizzle problem. Any reflected type carrying a `Buffer` field hit the same wall.

## What shipped

The root cause was a list that had fallen behind the lib: `reflection.NonSerializableGlobals` names
the globals the structural walk projects ATOMICALLY (subKind + classRef, no member walk) instead of
descending into. `Uint8Array` was on it. Two things were missing.

**1. The ESNext iterator objects.** The list already held `Iterator`, `AsyncIterator`, `Generator`
and `AsyncGenerator`. ESNext added the iterator-helper family that every builtin's `values()` /
`keys()` / `entries()` now returns, and those carry `map<U>(): IteratorObject<U, …>`, which
re-instantiates itself at every level. Added `IteratorObject`, `AsyncIteratorObject`,
`ArrayIterator`, `MapIterator`, `SetIterator`, `StringIterator`, `RegExpStringIterator`. An iterator
was never data, so the walk had no business reaching them.

**2. `Buffer` itself.** Node's `Buffer` is a `Uint8Array` subclass at runtime, so it belongs beside
the typed arrays. Without it the walk descended into the `Uint8Array` members Buffer inherits and
came out at the iterator objects. Listing it also settles a disagreement that predates this bug:
`DataOnly<T>` already stripped `Buffer` (it satisfies `ArrayBufferView`) while the emitter walked it
as a plain class.

Every newly listed name was a hard build error before, never a working projection, so nothing that
used to resolve changed shape. `Buffer` is the one exception: on ES2023 it used to reflect as a
walked class and now reflects atomically, which is the correction described above.

The JS mirror `NON_SERIALIZABLE_GLOBALS` is generated from the Go list and was regenerated.

### Collateral: the walk-budget test

`TestResolveType_TruncatedSource_WalkBudgetBounds` (the enrich path's pin for the walk backstop) used
a fuzz-corrupted source whose spiral rode the ESNext lib's `Set` iterator members. Those are atomic
now, so that fixture stopped spiralling. It was rebased onto `Promise`, which self-instantiates the
same way (`then<U, V>(): Promise<U | V>`) and keeps the corruption's shape otherwise identical.

Establishing that also turned up a coverage gap that was there all along: the walk backstop's two
caps share one latch, and it is the DEPTH cap that fires on every real fixture (a fresh-minting graph
goes deep long before its op count climbs), so `maxWalkOps` had no pin despite the test's name. It
has one now — `TestWalkBudget_OpsCapRefusesTheSite` lowers the cap to the walk through a test-only
seam (`SetMaxWalkOpsForTest`, the reason `maxWalkOps` is a var), asserts an ordinary shallow type is
then refused and diagnosed, and asserts it resolves again under the real cap.

## Tests

- `ts-go-runtypes/internal/cachegen/runtype/typeid/esnext_lib_test.go` — writes a real tsconfig so
  the lib is part of the test, not an accident of the repo config. A `Buffer` field resolves on
  lib.esnext and lands on the same id as under lib.es2023; `Buffer` projects atomically with
  `SubKindNonSerializable` and no members; a typed-array subclass and explicit `ArrayIterator`,
  `MapIterator` and `IteratorObject` fields all resolve. Both marker call shapes, paired.
- `ts-go-runtypes/internal/cachegen/runtype/typeid/walkbudget_test.go` — the ops-cap pin above.
- `packages/ts-runtypes-devtools/test/esnext-lib-buffer.test.ts` — the same thing through the daemon
  the plugin drives, with the lib written into a real tsconfig. No MKR009, three sites, one shared
  id across both marker shapes, and the same id under es2023.
- `packages/drizzle-orm-sqlite-core/src/typeTables.spec.ts` — the two-roads oracle now covers a
  `blob({mode: 'buffer'})` column (plus a json-mode one). This was the gap that hid the bug: the
  sqlite type-road specs had never used a blob column.
- `packages/ts-runtypes/test/types/dataonly.compile.test.ts` — `DataOnly<Buffer>` is `never` and a
  Buffer property drops, pinning that the TS projection and the Go emitter now agree.

## Docs

`container/website/sites/runtypes/content/02.guide/03.validation.md` listed the non-serializable
members as "functions, methods, getters, symbols"; it now names binary values too. The drizzle column
table already documented blob buffer mode as `Buffer` and needed no change.

## On the ES2023 pin

The spec's acceptance check was "the drizzle-e2e lane's `lib: ["ES2023"]` pin can be removed". That
pin lives on the in-flight drizzle type-road branch, not on `main`: both
`container/drizzle-e2e/shared/tsconfig.json` and the config
`scripts/core/drizzle-translate.mjs` generates already target ESNext with no `lib` override, and both
still typecheck. So there is nothing to remove here, and the pin never needs to be added.
