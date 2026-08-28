---
type: feature
spec: full-plan
status: ready
created: 2026-08-28
---

# Playground teaches the static form, and factory args stop counting as a value use

## Problem

Two halves of the same gap, both about `docs/done/unused-runtypes-elision.md`
(the always-on elision: a builder const whose value is never used emits no
reflection graph).

**1. The playground never shows the recommended shape.** Every builder preset
names the schema const `MyType` and lets the engine append the value-first call
`createValidateFn(MyType)` (`container/website/app/playground/engine.ts:147`,
`:185`). A value use keeps the graph, so the Generated cache panel always shows
the full runtype bundle on top of the fn cache. The header comment at
`container/website/app/playground/presets.ts:11-15` calls this deliberate
("Builder mode keeps the value-first call ON PURPOSE"), but the visible result is
that the playground teaches the shape the docs tell people not to write, and the
derived type (`type Simple = InferType<typeof MyType>`) dangles unused in every
preset. The shape to show instead:

```ts
const MetaData = RT.object({...});
type MyType = InferType<typeof MetaData>;
const validate = createValidateFn<MyType>();
```

That also makes builder mode line up with TS-type mode: both end at `MyType`,
both call `createValidateFn<MyType>()`, the only difference is how the shape was
authored.

**2. Passing a schema to a factory should not count as a value use.**
`ts-go-runtypes/internal/compiler/builders/usage.go:22-25` is default-deny: any
argument position, `createXFn(myRT)` explicitly included, keeps the graph. But
that argument is dead at runtime once the plugin has rewritten the call: the site
carries its own injected entry tuple, and with no live node on slot 0
`isRunTypeValue` is false (`packages/ts-runtypes/src/runtypes/rtUtils.ts:42`, the
carrier from `builderResult` has no `id`), so the factory resolves the injected
tuple's own key. Excluding factory arguments makes the value-first spelling as
cheap as the static one, which is a real bundle win for anyone who prefers it.

Part B still lands even with Part A in place: the point of the playground change
is teaching the recommended handle (a plain TS type both modes end at), not the
emission difference.

## Plan

### Part A: factory arguments are not a value use (Go)

`ts-go-runtypes/internal/compiler/builders/usage.go`

- `typeOnlyReference(identifier)` (usage.go:158) gains a second accepted
  position: the identifier is the DIRECT argument of a call whose callee carries
  an `InjectTypeFnArgs` marker parameter (fn keys present) and is not a builder
  and not `getRunType`. Rename it to something like `nonValueReference` since it
  is no longer only about types.
- Recognition reuses what the scanner already has: `marker.KindInjectTypeFnArgs`
  + `marker.FnKeysForInjectTypeFnArgs`
  (`internal/compiler/marker/marker.go:443`), the same read `scan.go` does to
  fill `slot.fnKeys`. Exclude `builders.IsValueBuilderCall` (a builder composing
  the const keeps the graph) and `builders.IsIdLookupCall` (`getRunType` throws
  without an id).
- Threading: `UnusedBuilderConst` (usage.go:59) and `symbolValueUsed`
  (usage.go:126) take `markerOpts marker.Options`; the single caller at
  `internal/compiler/resolver/scan.go:685` already has `state.sess.marker`.
- DIRECT argument only. `createValidateFn(RT.partial(myRT))` is an argument of a
  builder, so it stays a value use. Anything not positively recognized still
  keeps the graph.

**Verify before shipping (the one real risk).**
`packages/ts-runtypes/src/createRTFunctions.ts:245-251` documents slot 0's live
`.id` as OVERRIDING the injected typeId, "correct even for recursive schemas",
and `entryTuple.ts:779` performs that substitution. Elision removes the live id,
so the injected key must already be the right one. Prove it on a circular schema
(`RT.circular` + `RT.self()`, the playground Tree preset shape): assert the
elided value-first validator resolves the same entry and behaves the same as the
kept one. If the ids genuinely diverge, narrow Part A to non-circular schemas and
record why in the doc that lands in `docs/done/`.

### Part B: playground presets use the static form

- `container/website/app/playground/markerDts.ts:16` — add
  `export const ROOT_SCHEMA = 'MetaData'` beside `ROOT_TYPE = 'MyType'`;
  re-export from `playground/index.ts` next to `ROOT_TYPE`.
- `container/website/app/playground/presets.ts` — rewrite all six builder
  snippets (Simple :39, User :71, Order :108, BlogPost :151, Product :189,
  Tree :217): the const becomes `MetaData`, the closing line becomes
  `type MyType = InferType<typeof MetaData>;`. The per-preset derived names
  (`Simple`, `User`, `Order`, `BlogPost`, `Product`, `Tree`) go away, since the
  engine's call needs `ROOT_TYPE`. Rewrite the header comment (presets.ts:1-19),
  dropping the value-first justification and stating the new one: both modes end
  at `MyType`, the schema const stays unused so the build emits no runtype cache
  for it.
- `container/website/app/playground/engine.ts` — the fn factories use the
  type-first call shape in BOTH modes: `factoryCall` (:145) and `scan` (:176)
  stop branching on `mode` for them. `getRunType` keeps the value overload in
  builder mode (`getRunType(MetaData)`) so the reflection op still demonstrates
  it and still shows a real graph; add a small `usesSchemaValue(factory, mode)`
  helper rather than sprinkling a `factory === 'getRunType'` test. Update the
  `factoryCall` doc comment (:132-144), the padding-cleanup comment (:288-296,
  the `(MyType, __rt_…)` case now only arises for getRunType) and the
  `pickFactorySite` note (:158-162, the second site now only appears for the
  value-first getRunType op).
- Check `PlaygroundStage.client.vue` copy that describes the mode switch (`:2`
  header comment, `:444` "The call shape differs by mode") and correct it.
- Manual check via the website-browser skill: for each preset in builder mode the
  Generated cache panel shows only the fn module (no `runtypes` bundle), the
  validate / mock / JSON ops still run, and the graph op still renders a tree.

## Tests

Go (`ts-go-runtypes/internal/compiler/resolver/unused_runtypes_test.go`):

- `TestElision_ValueFormKeepsGraph` (:55) INVERTS: `createValidateFn(myRT)` now
  emits no bundle while keeping its val entries. Rewrite it (and the file's
  header comment at :3-12, which states the old acceptance pair).
- New: every factory family elides (`createJsonEncoderFn`,
  `createBinaryEncoderFn`, `createMockDataFn`), a builder argument
  (`createValidateFn(partial(myRT))`) still keeps the graph, `getRunType(myRT)`
  still keeps it, a const passed to a factory AND read elsewhere (`myRT.kind`)
  still keeps it.
- Marker test coverage rule (`ts-go-runtypes/CLAUDE.md`): the paired
  `getRunTypeId` call shapes wherever the new tests touch the marker API.

Front end:

- `packages/ts-runtypes-devtools/test/unused-runtypes-elision.test.ts` — the
  value-form lane inverts: one site, zero runtype modules, validator still
  behaves.
- `packages/ts-runtypes/test/features/unusedBuilderElision.test.ts` — through the
  real vitest plugin: `createValidateFn(myRT)` with no other use registers no
  graph and still validates; the circular-schema case above; `getRunType(myRT)`
  still registers its graph.
- Whole suite is the regression net (the behavior is default-on): audit fixtures
  whose builder const is only passed to a factory and fix expectations.

The website container has no vitest project, so Part B is covered by the manual
browser check plus the root `typecheck` over the playground sources.

## Docs

- `container/website/sites/runtypes/content/02.guide/01.type-builders.md:32` — the
  sentence "The moment you use the schema value itself (pass it to a create
  function, read its properties, or export it)" becomes wrong. Drop the
  create-function clause and say plainly that handing a schema to a create
  function is free, reading its properties or exporting it is what keeps the
  description.
- `packages/examples/src/guide/type-builders-static.ts` — still correct; no change
  expected, confirm it compiles unchanged.
- Website style rules apply (no dashes chaining clauses, MDC structure untouched,
  component + fence counts unchanged).

## Fuzzing

Cheap oracle available and worth it: for a generated schema, the value-first
elided validator and the static-form validator must agree on the same inputs
(same compiled entry). Fold into the existing validation fuzz lane rather than a
new suite.

## Out of scope

- Eliding a const composed into another builder (`RT.object({a: Address})` keeps
  `Address`'s graph). Separate analysis, separate todo if wanted.
- Cross-file use analysis; exported consts stay kept.
- Any new playground UI copy or panel explaining the emission difference.

## Done when

- Builder-mode presets read `const MetaData` →
  `type MyType = InferType<typeof MetaData>` → `createValidateFn<MyType>()`, and
  the Generated cache panel shows no runtype bundle for them.
- `createValidateFn(myRT)` (and every sibling factory) emits no reflection graph
  when the const has no other use, proven on a circular schema too.
- Go + JS suites green, guide copy matches the new behavior, spec moved to
  `docs/done/`.
