---
type: feature
spec: full-plan
status: shipped
created: 2026-08-28
---

# Playground teaches the static form, and factory args stop counting as a value use

## Problem

The always-on elision (`docs/done/unused-runtypes-elision.md`) dropped a builder
const's reflection graph when the const's value was never used. Two gaps
remained.

**1. Handing a schema to a factory counted as a value use.** The classifier was
default-deny, so `createValidateFn(myRT)` kept the whole graph. But that argument
is dead at runtime once the plugin rewrote the call: the site carries its own
injected entry tuple, and with a carrier on slot 0 `isRunTypeValue` is false
(`packages/ts-runtypes/src/runtypes/rtUtils.ts:42`), so the factory resolves the
injected tuple's own key.

**2. The playground taught the value-first call** and let the recovered type
dangle unused in every builder preset, so it modelled the shape the docs tell
people not to write.

## What shipped

### Part A — factory arguments are not a value use (Go)

- `internal/compiler/builders/builders.go` — new `IsTypeFnFactoryCall`: a call
  whose callee declares an `InjectTypeFnArgs` marker parameter, read through
  `marker.DetectAny` the same way `scan.go` fills its slots. Builders and
  `getRunType` are excluded.
- `internal/compiler/builders/usage.go` — `typeOnlyReference` became
  `nonValueReference` and now also accepts an identifier that is a DIRECT
  argument of such a call. `createValidateFn(partial(myRT))` stays a value use.
  `UnusedBuilderConst` and `symbolValueUsed` take `marker.Options`; the one
  caller (`resolver/scan.go`) already had it.

The recursive-schema risk (`createRTFunctions.ts:250` substitutes the live
schema's `.id` into the cache key, documented as mattering for recursive
schemas) was checked and did NOT materialise: a `circular` + `self` schema
handed to `createValidateFn` elides its graph and still validates a whole tree.
Pinned by `TestElision_CircularFactoryArgumentElided` and by the recursive lane
in `unusedBuilderElision.test.ts`. No narrowing was needed.

### Part B — the playground shows the static form

- `container/website/app/playground/presets.ts` — all six builder snippets build
  `const MetaData = RT.…` and close with
  `type MyType = InferType<typeof MetaData>`, so both authoring modes end at the
  same handle. Header comment rewritten (it used to justify the value-first
  call).
- `container/website/app/components/playground/PlaygroundStage.client.vue` — one
  `CALL_FORM` constant: the UI asks the engine for the STATIC call form in both
  modes, `getRunType` included, so the footer reads `createValidateFn<MyType>()`
  and `mode` selects only which preset text loads.
- `container/website/app/playground/engine.ts` — unchanged behaviour: it still
  renders the value-first form for anyone driving it headlessly (and its own
  tests), with a comment saying the UI no longer asks for it.

## Corrections to the original spec

Four things the spec assumed turned out differently:

- **The playground HAS a vitest project** (`packages/ts-runtypes/test/playground/`),
  so Part B is covered by tests, not by a manual browser check alone.
- **A dedicated fuzz lane already compared the two spellings**
  (`packages/ts-runtypes/test/fuzz/elision/`), and its E2 oracle asserted the
  opposite of this change. It was inverted and tightened rather than folding a
  new property into the validation lane.
- **No `ROOT_SCHEMA` constant was needed.** The engine never emits the schema
  name, so the presets just write `MetaData` in their own source text.
- **The `getRunType` op went type-first too** (the call the spec left open), so
  the playground never asks for the value-first form.

## Tests

Go — `internal/compiler/resolver/unused_runtypes_test.go`: the value-form
acceptance case inverted (`TestElision_FactoryArgumentElided`), plus every
factory family, two factories over one const, the circular schema, a composing
builder argument, a factory argument alongside a property read, `getRunType(myRT)`,
and the paired `getRunTypeId` shapes (asserted on reflection-site counts, since a
`getRunTypeId` site is itself a reflection root).

Front end:

- `ts-runtypes-devtools/test/unused-runtypes-elision.test.ts` — the value form
  now emits one site and zero runtype modules; a new id-lookup case is the
  counter-example that keeps the graph.
- `ts-runtypes/test/features/unusedBuilderElision.test.ts` — four lanes through
  the real plugin: static, factory argument, recursive factory argument, and the
  `getRunType` lane that keeps its graph.
- `ts-runtypes/test/playground/presets.test.ts` — pins `const MetaData` +
  `type MyType = InferType<typeof MetaData>` in every builder preset.
- `ts-runtypes/test/playground/engine.test.ts` — every builder preset emits its
  fn cache and no `runtypes` bundle, through the real WASM resolver.

Fuzz — `ts-runtypes/test/fuzz/elision/`: `checkValueRootKept` became
`checkValueRootRow` (a builder-printed root leaves no row on the value side; an
escape-printed one still does), `checkStaticRootSiteGone` became
`checkRootSiteGone` and runs on both spellings, `checkStaticZeroReflection`
became `checkZeroReflection` and runs on both, and a new
`checkAllEntriesIdentical` requires declaration-free fixtures to be byte-identical
across spellings INCLUDING the bundle. The oracle unit lane proves each still
fires. A 60s soak covered 251 generated schemas with zero violations.

## Docs

`container/website/sites/runtypes/content/02.guide/01.type-builders.md` — the
paragraph claiming that passing a schema to a create function keeps its runtime
description now says that is free, and that reading or exporting the schema is
what keeps it. MDC component and fence counts unchanged.

## Not done

The manual browser pass over the playground could not run in this environment:
the website container image is neither pullable nor buildable here (GHCR auth and
docker.io both refused). The playground vitest project exercises the same engine
over the real presets, so the behaviour is covered; only the visual check is
outstanding.

## Out of scope (unchanged)

- Eliding a const composed into another builder (`RT.object({a: Address})` keeps
  `Address`'s graph).
- Cross-file use analysis; exported consts stay kept.
- New playground UI copy explaining the emission difference.
