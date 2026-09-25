---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# A marker wrapped in a user alias injects the id of `unknown`

## Intent

A parameter typed through an alias over a marker is matched only by its brand property, so the build injects the id of `unknown` and says nothing:

```ts
type Slot<P, R> = InjectRunTypeId<[P, R]>;
function fn(x?: Slot<A, B>) {}
```

In `ts-go-runtypes/internal/compiler/marker/marker.go`, `DetectAny` tries `matchAliasSpec`, which sees the outer alias name (`Slot`) and fails, then `matchedByBrand` matches with a nil type argument. The scanner still emits a site, for `unknown`.

Found while adding the route `syncId` slot to the router helpers (`packages/router/src/types/mionRouter.ts`): every handler silently got the same id until the alias was inlined. The bundled-vs-server parity test in `packages/client/test/lib/parity.ts` caught it. Predates that change.

## Direction

Either resolve the type argument through a wrapping alias when the marker comes from the trusted package (read the brand property's type, or walk the alias chain), or raise a clear diagnostic when a trusted-package marker matches by brand only. Keep the untrusted-package gate (MKR012 near miss) inert for a project's own look-alike brand. Follow the Marker test coverage rule in `ts-go-runtypes/CLAUDE.md`. The implementer plans the details.

## Docs

None, because this is build internals with no consumer-facing knob.

## Done when

- A marker wrapped in an alias either injects its real type argument or the build reports it.
- Go and JS tests cover it, with both `getRunTypeId` call shapes as paired tests.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-25)

Resolve the type argument through the brand property, strip `undefined`, no change to the public marker type.

- Reproduce first: Go tests in `ts-go-runtypes/internal/compiler/resolver/marker_alias_wrapped_test.go` and JS tests `17g` in `packages/devtools/test/wrapping.test.ts`, both failing before the fix.
- `marker.go`: when a marker matches only by its brand property, read that property's type (only when the trusted marker package declared it) and return it as T, for `InjectRunTypeId` and `InjectTypeFnArgs`. For `InjectTypeFnArgs`, read the Fn keys off the `__rtInjectTypeFnArgsFns` tuple the same way.
- No docs, no fuzzing.

## What shipped

- `typeArgumentFromBrand` / `trustedBrandType` in `marker.go`: the brand's type with `undefined` removed by `RemoveMissingOrUndefinedType`, so `null` survives. Known limit: a wrapped `Slot<X | undefined>` resolves as `X` (without `exactOptionalPropertyTypes`).
- `fnKeysFromBrand`: a wrapped `InjectTypeFnArgs` keeps its function families. Without it the value-shape site lost its fnId.
- Only the static shape (`wrap<T>()`) was broken; the value shape (`wrap(value)`) already inferred T from the argument. Both are now tested.
- A look-alike brand from an untrusted package still resolves to `unknown` for the static shape, exactly as before.
