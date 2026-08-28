---
type: feature
spec: full-plan
status: shipped
created: 2026-08-28
---

# Playground teaches the static form

## Problem

The playground's builder presets named their schema const `MyType` and let the
engine append the value-first call `createValidateFn(MyType)`, so the recovered
type (`type Simple = InferType<typeof MyType>`) dangled unused in every preset.
That modelled the shape the docs steer people away from: the recommended handle is
the plain TypeScript type, which leaves the schema value unused so the build emits
no runtype cache for it (`docs/done/unused-runtypes-elision.md`).

## What shipped

- `container/website/app/playground/presets.ts` — all six builder snippets build
  `const MetaData = RT.…` and close with
  `type MyType = InferType<typeof MetaData>`, so both authoring modes end at the
  same handle. Header comment rewritten (it used to justify the value-first call).
- `container/website/app/components/playground/PlaygroundStage.client.vue` — one
  `CALL_FORM` constant: the UI asks the engine for the STATIC call form in both
  modes, `getRunType` included, so the footer reads `createValidateFn<MyType>()`
  and `mode` selects only which preset text loads.
- `container/website/app/playground/engine.ts` — behaviour unchanged: it still
  renders the value-first form for anyone driving it headlessly (and for its own
  tests), with a comment recording that the UI no longer asks for it.

On screen, the Generated cache panel now shows only the fn module for a builder
preset, no `runtypes` bundle.

## Tests

- `packages/ts-runtypes/test/playground/presets.test.ts` — pins `const MetaData`
  and `type MyType = InferType<typeof MetaData>` in every builder preset, and that
  no `const MyType` schema is left to shadow the type.
- `packages/ts-runtypes/test/playground/engine.test.ts` — every builder preset
  emits its fn cache and no `runtypes` bundle module, through the real WASM
  resolver. Covers the recursive preset too.

Corrections to the original spec, found while implementing: the playground DOES
have a vitest project (`packages/ts-runtypes/test/playground/`), so this is
covered by tests rather than a manual pass only; and no `ROOT_SCHEMA` constant was
needed, since the engine never emits the schema name.

## The compiler half was dropped, deliberately

The spec also proposed making a schema handed straight to a `createXFn` stop
counting as a value use, so `createValidateFn(myRT)` would emit no reflection
graph either. It was built, tested and fuzzed, then removed. Do not re-attempt it
in this form. Why:

- **The invariant is unenforced.** The exemption is only safe because every
  `createXFn` today reads at most the schema's `.id` before resolving through
  `resolveEntryTupleFn`. The rule keys on the `InjectTypeFnArgs` marker, so ANY
  future factory carrying that marker joins the exempt set automatically. A
  factory that actually walks its schema would then be handed a bare carrier, and
  the failure surfaces far from the change.
- **A consumer wrapper broke.** A third-party wrapper may declare the same marker
  and legitimately read its `RunType` argument. Measured against the pre-change
  binary, its argument went from `{"kind":30,"id":"DxL5Lr7"}` to `{}`. Gating on
  `DeclaredInMarkerPackage` fixed it, but left a quirk: identical code elides
  inside `packages/ts-runtypes/` and not in a consumer package.
- **The win goes to the form we steer away from.** Only the value-first spelling
  gained anything, and the docs, the playground and the examples all recommend the
  static one.
- **It blurs the mental model.** "Pass a type, no runtime value; pass a value,
  it's a value" is clean. "Pass a value, but it is secretly unused, unless the
  callee is ours" is one more rule to hold for a modest bundle saving.

`createMockDataFn` is worth recording here: it carries `InjectRunTypeId`, not
`InjectTypeFnArgs`, and looks its graph up at runtime
(`utils.getRunType(effectiveId)`, throwing without it). It sat on the safe side of
that rule by accident of which marker it declares, which is itself a sign the
boundary was not a designed one.

If the idea is ever revisited, the price of keeping it honest is making the
invariant declared instead of assumed: a per-factory opt-in stating "never reads
its schema", so a new factory cannot silently join the exempt set.

## Out of scope

- Eliding a const composed into another builder (`RT.object({a: Address})` keeps
  `Address`'s graph).
- Cross-file use analysis; exported consts stay kept.
- New playground UI copy explaining the emission difference.

## Not done

The manual browser pass over the playground could not run in this environment:
the website container image is neither pullable nor buildable here (GHCR auth and
docker.io both refused). The playground vitest project exercises the same engine
over the real presets, so the behaviour is covered; only the visual check is
outstanding.
