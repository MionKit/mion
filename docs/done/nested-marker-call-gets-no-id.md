---
type: fix
spec: guidelines
status: done
created: 2026-09-25
---

# A marker call nested inside another marker call's arguments gets no id

## Intent

When one marker call (a call whose callee takes `InjectRunTypeId<T>`, like `tableFromType<T>()` or `toDrizzle<T>()`) sits anywhere inside the arguments of another marker call, the inner call gets no id at build time. It throws at run time:

```
Error: getRunType(): no id injected. @mionjs/devtools must be active.
```

Found while testing the drizzle pg packages. It predates that work: the repro below uses only shipped code.

## Repro

A vitest file in `packages/drizzle-orm-pg-core/test/` (the `drizzle-pg` project runs the devtools transform):

```ts
import {it, expect} from 'vitest';
import {getTableConfig} from 'drizzle-orm/pg-core';
import type {Integer, PgTable} from '../src/index.ts';
import {tableFromType} from '../src/index.ts';
import {toDrizzle} from '../src/drizzle.ts';

type Parents = PgTable<'parents', {id: Integer<'id', {primaryKey: true}>}>;
type Children = PgTable<'children', {pid: Integer<'pid', {references: [{table: 'parents'; column: 'id'}]}>}>;

it('nested in an arrow inside a marker call argument', () => {
  const children = toDrizzle<Children>({tables: {parents: () => tableFromType<Parents>()}});
  expect(getTableConfig(children).foreignKeys[0]!.reference().foreignTable).toBeTruthy(); // throws
});
it('nested directly in a marker call argument', () => {
  expect(toDrizzle<Children>({tables: {parents: tableFromType<Parents>()}})).toBeTruthy(); // throws
});
it('control: hoisted', () => {
  const parents = tableFromType<Parents>();
  const children = toDrizzle<Children>({tables: {parents: () => parents}});
  expect(getTableConfig(children).foreignKeys[0]!.reference().foreignTable).toBeTruthy(); // passes
});
```

The arrow case only throws when the arrow runs (here, when the foreign key is read). A test that never calls it passes and hides the bug.

## Where to look

- The Go scanner and rewrite: `ts-go-runtypes/internal/compiler/resolver/scan.go` (call-site discovery) and the `EditBuffer` edits in `internal/compiler/sourcerewrite/`. The likely cause is that the inner call's edit falls inside the outer call's argument range and is dropped or overwritten.
- The TS side of the same rewrite in `packages/devtools/src/core/` (both `transformMode: 'go' | 'edits'` must agree; the mode-parity corpus pins that).
- Check other marker families too (`createValidateFn<T>(...)` nested in another `createX<T>(...)` call), not just the drizzle ones.

## Done when

- Both nested forms above get their ids, with Go tests and a devtools test, both `getRunTypeId` call shapes where a marker API is involved (Marker test coverage rule in `ts-go-runtypes/CLAUDE.md`).
- The mode-parity corpus has a nested case.

## Plan (approved 2026-09-25)

**Cause.** Not the edit buffer. The scanner's nested-builder skip in `analyzeCall` (`ts-go-runtypes/internal/compiler/resolver/scan.go`) dropped the id of ANY marker call inside an injection marker's arguments, with only `getRunType` exempt. It was meant for value-first builders (`string()` inside `object({...})`), whose runtime falls back to its carrier without an id. Every other marker call (`tableFromType`, `getRunTypeId`, `createX`) needs its id.

**Fix.** The skip now fires only for `builders.IsMarkerBuilderCall`: a call returning the marker package's `RunType<…>` (not `getRunType`) whose callee the marker package itself declares. A user wrapper returning `RunType<T>` keeps its id, since it may forward to `getRunType`. No TS-side change: the devtools only apply the Go edits.

**Tests.**
- Go `resolver/nested_marker_test.go`: nested directly, in an arrow, `createValidateFn`, a user `RunType` wrapper, and the paired `getRunTypeId` shapes (with id equivalence against a top-level call). `TestScan_GenuineNestedBuilderStillEnclosed` now uses the real marker builders.
- Mode-parity corpus `packages/devtools/test/transform-modes.test.ts`: both `getRunTypeId` shapes nested directly and in an arrow.
- Runtime `packages/run-types/test/features/nestedMarkerCalls.test.ts`: both `getRunTypeId` shapes and a `createValidateFn` nested in a non-builder marker.
- The repro above as `packages/drizzle-orm-pg-core/test/nestedMarkerCalls.spec.ts`.
- `packages/devtools/test/wrapping.test.ts` 17g pinned the old skip with user-declared `model`/`field` markers. It now expects their 3 sites, and a new case pins real builders nested in `RT.object` to 1 site.

**Docs.** None: no page describes the skip.

