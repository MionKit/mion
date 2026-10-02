---
type: fix
spec: guidelines
status: ready
created: 2026-10-02
---

# `mion convert` drops `readonly` on tuples

## Intent

`mion convert --to builders` silently loses the `readonly` modifier of a tuple type. The output still
compiles, so nothing tells the user their type changed.

```ts
// input
export type Pair = readonly [number, Pair?];
// output: the recursive-type path rewrites the type, readonly gone
export type Pair = [number, Pair?];
export const pairRT = getRunType<Pair>();
```

More shapes seen:

- `export type K4 = {a?: K4} | readonly [K4];` becomes `export type K4 = [K4] | {a?: K4};`.
- `export type Box = {readonly items: readonly [Box?]; name: string};` becomes
  `RT.object({items: RT.propMod({readonly: true}, RT.tuple({optional: [RT.self()]})), ...})`: the property keeps
  `readonly`, the tuple's own `readonly` is lost.
- The structural id ignores tuple `readonly`, so `export type K6 = {a?: K6} | [K6];` in the same run became
  `getRunType<K4>()`, an alias of the readonly one.

The website page `container/website/content/02.runtypes/04.tooling/02.source-conversion.md` (section
"Recursive Types") says the converter "keeps the type as written" for recursive types that need the escape, which
the first case contradicts.

Repro: put the declarations in a file under `packages/run-types/test/probe/` and run
`./mion-bin/mion convert --tsconfig packages/run-types/tsconfig.json --to builders packages/run-types/test/probe --out-dir packages/run-types/test/probe-out`.

## Direction

- Find where the type form of a recursive declaration is reprinted instead of kept, and where the builder form
  prints a tuple (`ts-go-runtypes/internal/convert/`). Decide per target whether a readonly tuple can be spelled
  (a builder option, `RT.propMod`, the escape) or must refuse with a documented row, never drop silently.
- Check whether the reflection keeps tuple `readonly` at all; if the id ignores it on purpose, two declarations
  that differ only in `readonly` must not alias each other in convert output.
- Same check for `readonly T[]` arrays.
- Add convert tests for each shape above, and update the source-conversion page if behaviour or a limit changes.

## Done when

- None of the shapes above loses `readonly` in convert output, or each refuses with a row in
  `packages/run-types/test/features/unsupported-conversion.test.ts`.
- `pnpm miondevx core converted-suites` still passes (update its count in the same commit if it moves).

## Plan (approved 2026-10-03)

Readonly stays part of the id and of reflection, the way property readonly already is; tuples and arrays join it.

- Reflection: `projectTuple` and the array branch of `projectObjectType` set `Readonly` from the checker (readonly tuple target, `ReadonlyArray` reference), through one helper shared with the id.
- Id: `tupleID`, the array id and the index-signature id append `readonlyBit`, so mutable ids do not move.
- Convert: type form prints `readonly [..]`, `readonly T[]` and `readonly [k: K]: V`; builder form wraps with `RT.readonly(...)`, or uses the `getRunType<T>()` escape when that spelling does not reflect back.
- Tests: Go id/projection and convert tests for every shape above, a JS feature test with both marker shapes, `converted-suites` count re-checked.
- Docs: the source-conversion page; one line in `ts-go-runtypes/CLAUDE.md`.
