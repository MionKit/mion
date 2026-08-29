---
type: fix
spec: guidelines
status: ready
created: 2026-08-29
---

# A Buffer column cannot be reflected on the ESNext lib (MKR009)

## Intent

On a project compiled against the ESNext lib, reflecting a type whose data reaches Node's `Buffer`
fails the build outright. It surfaced on the drizzle type road, where `tableFromType<T>()` is the one
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

This is not a drizzle problem. Any reflected type carrying a `Buffer` field should hit the same wall,
which means a consumer on `target/lib: ESNext` cannot use a blob buffer column at all, and probably
cannot reflect a model with a Buffer field either. It is worth fixing because ESNext is an ordinary
thing for a consumer to compile against.

## Direction

The implementer plans the details; verified starting points:

- Reproduced with the devtools vite plugin over `.cache/drizzle-suites/<tag>-types/` produced by
  `pnpm rtx core drizzle-translate --to-types --keep`. Pinning `lib: ["ES2023"]` in that tree's
  tsconfig makes it go away; ESNext brings it back. The drizzle-e2e lane pins ES2023 for exactly
  this reason (container/drizzle-e2e/shared/tsconfig.json and scripts/core/drizzle-translate.mjs),
  so removing the pin is the acceptance check.
- FIRST establish the minimal repro and how wide it is: is it any reflected `{b: Buffer}`, or only
  the drizzle path? `ts-runtypes compile --no-emit` is NOT a usable probe here (it reports zero
  files for a plain `getRunTypeId` call too); the devtools plugin's buildStart is what surfaces the
  diagnostic, so reproduce through a vitest run with `@ts-runtypes/devtools/vite`.
- The reflection does not need a column's data METHODS, only its shape, so one direction is to stop
  the walk at a known binary format rather than descending into `Uint8Array`'s iterator members. The
  self-instantiating-generic guard itself (MKR009) is correct and should stay; what is wrong is
  reaching that type at all for a value that has a perfectly good monomorphic shape.
- Check whether `@ts-runtypes/core/formats` already has a binary format the Buffer data can resolve
  to, and whether the same fix covers `Uint8Array` and `ArrayBuffer` fields.
- Coverage: the sqlite type-road specs never used a blob column, which is why this stayed hidden.
  Whatever lands should add one, plus a case compiled against the ESNext lib so the lib version is
  part of the test rather than an accident of the repo tsconfig.

## Done when

A type carrying a `Buffer` field reflects on the ESNext lib as it does on ES2023, pinned by a test
that compiles against ESNext; the drizzle-e2e lane's `lib: ["ES2023"]` pin can be removed with the
type-road tree still building, and the sqlite type-road specs cover a blob buffer column.
