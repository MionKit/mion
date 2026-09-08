---
type: chore
spec: full-plan
status: done
created: 2026-09-08
---

# One signature per router helper, and delete the duplicate

## Problem

`createMionRouter(opts)` returns closures typed by four interfaces in
`packages/router/src/types/mionRouter.ts`. They exist so the factory's options type `O` is baked
into every declaration: that is what types a handler's `ctx.shared` from `contextDataFactory` and
what lets a route naming no `encoder` resolve the router-wide one.

The cost was a second declaration surface. `lib/handlers.ts` held generic FUNCTIONS with their own
full signatures, `types/mionRouter.ts` held INTERFACES restating the same parameters, and
`router.ts` cast one onto the other. Ten-line marker blocks were written out twice per helper, and a
change to one needed a matching change to the other.

## What was tried first, and rejected

The original plan was to delete the interfaces and give each helper the router as its FIRST
argument, so `O` is inferred from an argument like any other type parameter:

```ts
const routes = {greet: route(mion, (ctx, name: string): string => `hi ${name}`)} satisfies Routes;
```

It worked, end to end, and it was rejected on ergonomics. Threading a value through every call site
purely to carry a type reads worse than a method, and `mion.route(handler)` is the shape the
framework wants. It also cost 13 extra type instantiations per lane, since `O` is then inferred once
per declaration instead of resolved once per router.

## What shipped instead

The duplication was never the call shape, it was the signature being written twice. So the
interfaces became the ONE signature, and the bodies are typed by them.

### 1. The marker slots are written once

`packages/router/src/types/encoder.ts` gained `MarkerSlots<Params, Return, RouteOpts, RouterOpts>`
and `HeaderMarkerSlots<Headers>`, labelled tuples carrying the injection parameters. Each helper
signature indexes them (`MarkerSlots<...>[0]`) instead of respelling `InjectTypeFnArgs<...>`. The
eight per-direction strategy aliases (`ParamsEncode` and friends) became internal to that file.

A type alias wrapped directly AROUND a marker is not recognised by the mion scanner; a tuple ELEMENT
keeps the marker's own alias and is. That was PROVEN before building on it, by dumping the injected
function tuples, generated source and type ids for the five internal routes and diffing them against
`main`: byte-identical.

### 2. The interfaces are the only signature

`RouteHelper`, `MiddleFnHelper`, `HeadersFnHelper` and `RawMiddleFnHelper` keep the full signature.
`lib/handlers.ts` now holds bodies and nothing else:

```ts
export const route: RouteHelper<RouterOptionsInput> = (handler, opts, paramsFns, returnFns, paramsId, returnId) => ({
  type: HandlerType.route, handler, options: opts, rtFns: {paramsFns, returnFns, paramsId, returnId},
});
```

`createMionRouter` narrows each to its own `O` with the same six casts as before. `mion.route(...)`,
the internal client / error / serializer routes, and the six casts are all unchanged from `main`.

### 3. The Go route rules lost their dead half

`ts-go-runtypes/internal/compiler/routerrules` kept two tables: `helperInterfaces` keyed on the
interface names, and `helperFunctions` keyed on the declaration names of the plain functions in
`lib/handlers.ts`. Those functions no longer exist, so every helper call, the framework's own
built-in routes included, now resolves to an interface call signature. `helperFunctions` and the
`declarationName` helper it needed are deleted, and the ambient fixture declares the package's own
helpers as interface-typed consts, which is what they are.

## Tests

- `packages/router` gained `typecheck:test` plus a `tsconfig.test.json` modelled on
  `packages/devtools/tsconfig.test.json`. `pnpm -r` picks it up, so it runs under `pnpm run lint`.
  Its specs had never been typechecked by anything; one real pre-existing error surfaced and was
  fixed (`test/fuzz/security/httpFuzzRunner.ts` annotated `validBodies` as
  `Record<string, unknown>`, which erased the field its liveness probe reads).
- `ts-go-runtypes/internal/compiler/resolver/tuple_slot_test.go` pins that a marker reached through
  a tuple ELEMENT is injected exactly like one spelled inline, carrying both `getRunTypeId` shapes
  as paired tests per the Marker test coverage rule. Without it, the `MarkerSlots` indirection could
  silently stop injecting and nothing would error.
- `packages/devtools/test/wrapper-strategy-families.test.ts` models the tuple slots too, so the
  end-to-end family selection is exercised through the same indirection the real helpers use.
- `TestRouterShapes_PackageOwnInternalHelper` in `routerrules_test.go` now declares the package's
  own helper as an interface-typed const.

Not a fuzz candidate: a type-declaration refactor with no round-trip, determinism or trusted-source
oracle.

## Type cost

Unchanged. `pnpm exec vitest run --project type-budget` still reports the `4 + mion route api` step
at 409 against its budget of 409, and the chain at 12883 against 12883. Indexing a tuple costs the
checker nothing here, which is part of why this shape won over the router-first one.

## Docs

`packages/router/CLAUDE.md` records why `O` can only ride on a method of the factory result. The
tuple-element marker trap is documented where it applies, in the `MarkerSlots` comment in
`packages/router/src/types/encoder.ts`, and guarded by the Go test above. No user-facing docs
changed: the public API is exactly what it was.

## Out of scope

- The encoder slot types (`ParamsEncode<RO, O>` and friends).
- The runtime router singleton: `initRoutes` still runs `initRouter` + `registerRoutes`.
- The call shape. `mion.route(handler)` stays.
