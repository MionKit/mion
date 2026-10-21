---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# A JSON encoder/decoder override may drop the primitives a route needs

## Intent

Unconfirmed, reproduce first. When a type has `overrideJsonEncoder` / `overrideJsonDecoder`, the Go
emitter skips that type's JSON primitive entries (`pj`, `pjs`, `sj`, `rj`, `ukuw`):

- `ts-go-runtypes/internal/cachegen/typefunctions/module.go:199-205` calls
  `compositeOverriddenForPrimitive` and returns early.
- `typefunctions/override.go:23-46` maps those tags to the composites.

The comment claims "the primitives are internal-only, demanded by composites". That is no longer true:
mion routes ask for `pj` / `pjs` / `rj` / `rjs` / `cj` / `cjr` directly (`packages/core/src/constants.ts`
`PARSE_MODES`), and so do `createPrepareForJsonFn` / `createRestoreFromJsonFn`. A type with an encoder
override used as a route param, or passed to `createPrepareForJsonFn`, may then find no compiled entry.

## Direction

The implementer plans the details. Write a failing test first: a type with `overrideJsonEncoder`
reached through `createPrepareForJsonFn` (and one through a route). If it fails, the skip must only
apply when nothing but the composite demands the primitive, or be removed. If it does not reproduce,
record why and fix the stale comment. Note `rjs`, `pjs`/`cj`/`cjr` are not all in the tag list; check
whether that asymmetry is itself a bug.

## Docs

None, unless the fix changes what an override covers; then update the override section of
`container/website/content/02.runtypes/02.guide/09.pure-functions.md`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A test covers an overridden type reached through the value-level JSON functions and a route.
- The emitter comment matches reality.
- `pnpm test` and `go -C ts-go-runtypes test ./internal/... ./cmd/...` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan, as built (2026-09-24)

Reproduced. With `overrideJsonEncoder` / `overrideJsonDecoder` on a type:

- `createPrepareForJsonFn<T>()`, `createRestoreFromJsonFn<T>()` and `createStringifyJsonFn<T>()` fell back to the
  identity function (a `bigint` reached `JSON.stringify` untouched).
- A parent type holding the overridden type lost its whole entry, because the skipped child dropped the parent.
- A route with the type as a param failed at `initRoutes` with `MissingRtFnsError` on `clone` and `mutate`.

Fix: the skip now applies only to a primitive demand that exists solely because an overridden composite asked.

- `operations.Demand` and `protocol.SiteDemand` carry `ComposedBy`, the composite op a primitive demand is for
  (empty for a direct demand). `DemandForOp` sets it; `scan.go` and `apigen.go` copy it.
- `collectFamilyDemand` clears `ComposedBy` when the same type is also demanded directly or by another composite.
- The skip moved from `renderEntry` (which also ran for nested children) to the root demand loop, via
  `composedByOverride`. The hardcoded tag list (`primitiveCompositeOpKey`) is gone, so the asymmetry is gone too:
  compact's `cj` / `cjr` now follow the same rule. `rjs` is never composed, so it is never skipped.

Tests: `packages/run-types/test/suites/overrides/JsonValueFns.ts` (value-level functions, both call shapes, nested),
`packages/router/test/jsonOverride.spec.ts` (clone / mutate / compact routes), and three Go tests in
`ts-go-runtypes/internal/compiler/resolver/overrides_test.go`. Docs: none, an encoder override still covers only
the encoder.
