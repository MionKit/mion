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

The failure was a symptom. The cause was that the projection recognises "this is
not data, take it whole" by a hand-maintained list of type NAMES, and a list of
names falls behind the standard library. Three things landed, in that order.

**1. The families that inheritance decides are matched by base.** Whatever extends
a typed array IS binary data, so Node's `Buffer` and any user subclass are taken
whole without being named. That is what `reflection.NonSerializableBaseGlobals`
is, and it is deliberately the ONLY such family: an earlier pass also base-matched
iterators, which silently stripped the data fields off any user type that extends
`Iterator` to become iterable. `Error` and the weak collections were never
base-matched, since `class RpcError extends Error` is real model data that
`registerClassSerializer` round-trips.

**2. The rest stay named, and a test guards the names instead of hope.** The lib's
iterator objects (`IteratorObject`, `ArrayIterator`, `MapIterator`, …) are listed
by name in `NonSerializableExactGlobals`. `PromiseLike` joined `Promise` for the
same reason: three sites matched a thenable by the exact string "Promise", so a
`PromiseLike` field halted the build on a type `Promise` handles fine. What keeps
those lists honest is `TestLibMatrix_ReflectionSurvivesEveryLib`, which reflects
representative types under every lib TypeScript ships, es2020 through esnext, in
about two seconds. A new edition now fails a test instead of a consumer build.

**3. When it does fall behind anyway, the message says so.** MKR009 ends with
"Reflect a monomorphic shape instead", which is useless advice for a type the
consumer did not write. A culprit declared inside the bundled standard library
now raises MKR014 instead, naming the lib file and saying plainly that the gap is
ours. Membership of the bundled lib directory is the test, not the file's name: a
consumer's own `src/lib.d.ts` keeps MKR009's actionable advice.

### What the fix was worth beyond the crash

The lib matrix test, run against the pre-fix code, failed two ways rather than
one. Besides the es2025 build stop, a `Buffer` field hashed to a DIFFERENT id on
es2020, es2022 and es2023 — one type split across three cache entries, because
the walk was hashing Buffer's member surface and that surface changes with the
lib. The crash was hiding a silent correctness bug. It is one id on all seven now.

### Collateral: the walk-backstop fixture

`TestResolveType_TruncatedSource_WalkBudgetBounds` pinned the walk backstop on a
fuzz-corrupted source whose spiral rode a lib type, first `Set` and then
`Promise`. It lost its teeth twice as those types got the coverage they should
always have had. Any lib type that still spirals is a bug we intend to fix, so
pinning a backstop to one guarantees the test decays; it now declares the
pathology itself.

Establishing that also turned up a gap that was there all along: the backstop's
two caps share one latch, and only the DEPTH cap ever fires on a real fixture
(a fresh-minting graph goes deep long before its op count climbs), so
`maxWalkOps` had no pin despite the test's name. It has one now, through a
test-only seam that lowers the cap to the walk.

## Tests

- `typeid/esnext_lib_test.go` — writes a real tsconfig so the lib is part of the
  test, not an accident of the repo config. A `Buffer` field resolves on
  lib.esnext with the same id as lib.es2023; `Buffer` projects atomically; a
  typed-array subclass and explicit `ArrayIterator` / `MapIterator` /
  `IteratorObject` fields all resolve. Plus the lib matrix and the one-id-across-
  every-lib pin. Both marker call shapes, paired.
- `typeid/nonserializable_test.go` — base matching needs no name; an `Error`
  subclass stays a class; a `Map` stays a `Map`; two subclasses keep distinct
  ids; a type extending `Iterator` keeps its own data; `PromiseLike` resolves
  like `Promise`; MKR014 fires for a staged lib culprit and NOT for a consumer's
  own `lib.d.ts`.
- `typeid/walkbudget_test.go` — the ops-cap pin and its restore.
- `ts-runtypes-devtools/test/esnext-lib-buffer.test.ts` — the same thing through
  the daemon the plugin drives, lib written into a real tsconfig.
- `drizzle-orm-sqlite-core/src/typeTables.spec.ts` — the two-roads oracle now
  covers a `blob({mode: 'buffer'})` column. This was the gap that hid the bug.
- `ts-runtypes/test/types/dataonly.compile.test.ts` — `DataOnly<Buffer>` is
  `never`, pinning that the TS projection and the Go emitter agree on binary.

## Docs

`02.guide/03.validation.md` listed the non-serializable members as "functions,
methods, getters, symbols"; it now names binary values too. `08.diagnostics.md`
gained a paragraph on MKR014, matching how the page already calls out MKR007 and
MKR013. The drizzle column table already documented blob buffer mode as `Buffer`
and needed no change.

## Left open

**Iterators disagree between the two projections.** The Go set treats an
`ArrayIterator` member as non-data and strips it; `DataOnly<T>` keeps it as `{}`.
So a decoded object's declared iterator property is `undefined` at runtime with
no type error. This predates the change for `Iterator` and `Generator`, which
were already on the Go list and never in `DataOnlyStripped`; listing the ESNext
iterator objects widens it to more spellings of the same shape. Closing it means
deciding what an iterator-typed field should mean, and the obvious structural
test on the TS side (anything with a `next()` method) has the same over-reach
problem that took iterators out of the base rule. Worth its own spec.

**Type-only names in the classRef.** `ArrayIterator`, `IteratorObject`,
`Generator` and friends are type-only: there is no such runtime global, so the
emitted `classType = globalThis.<name>` is `undefined`. Harmless today because
every emitter strips these values before reaching it, and it predates this change
(`Generator` was already listed), but it is latent wrongness worth cleaning up.

## On the ES2023 pin

The spec's acceptance check was "the drizzle-e2e lane's `lib: ["ES2023"]` pin can
be removed". That pin lives on the in-flight drizzle type-road branch, not on
`main`: both `container/drizzle-e2e/shared/tsconfig.json` and the config
`scripts/core/drizzle-translate.mjs` generates already target ESNext with no
`lib` override. So there is nothing to remove here, and the pin never needs to be
added.
