# @mionjs/router guidelines

## `import type` is SAFE in routes and middleFns

RunTypes resolves types at BUILD TIME from the TypeScript program and injects the compiled functions at the `mion.route()` / `mion.middleFn()` call site (the helpers `createMionRouter()` returns; the scanner reads the resolved signature, so a destructured helper is the same), so an erased import changes nothing. Guarded by [src/typeOnlyImports.spec.ts](src/typeOnlyImports.spec.ts).

This was NOT true under deepkit, whose runtime reflection was emitted from the import statement — `import type` stripped the metadata and caused silent failures. That is why the repo guidelines used to carry a "TYPE IMPORTS !!CRITICAL!!" warning and why `@mionjs/no-type-imports` existed; both are gone. Do not reintroduce either.

## Public env knob

`GENERATE_ROUTER_SPEC` is a public runtime knob read by this package. It is deliberately unprefixed (renaming it to `MION_*` would break consumers who already set it) — the one exception to the repo's env-var prefix rule.

## One router factory

`createMionRouter(opts)` ([src/router.ts](src/router.ts), types in [src/types/mionRouter.ts](src/types/mionRouter.ts)) is the ONLY public way to initialize the router and to declare routes / middleFns: the options are written once and ride by type (`O`) into every helper, so `ctx.shared` is typed from `contextDataFactory` and the router-wide `encoder` reaches what the build compiles for a route naming none. The runtime is still the module singleton: `mion.initRoutes(routes)` runs the private `initRouter` + `registerRoutes` in `src/router.ts`. The helper bodies in [src/lib/handlers.ts](src/lib/handlers.ts) are internal (the internal client / error / serializer routes use them directly) and are NOT exported from `index.ts`. Never re-add bare `route()` exports or a second init entry point.

`O` can only reach a declaration through a method of the object the factory returns: TypeScript has no partial type application, so a plain exported function cannot capture it. A defaulted type parameter does NOT work either, nothing at the call site infers it, so it silently takes its default and every route loses the router-wide encoder.

## ONE signature per helper, never two

`RouteHelper`, `MiddleFnHelper`, `HeadersFnHelper` and `RawMiddleFnHelper` in [src/types/mionRouter.ts](src/types/mionRouter.ts) are the ONE place a helper signature is written. Each body in [src/lib/handlers.ts](src/lib/handlers.ts) is a const TYPED BY its interface and declares no parameters of its own:

```ts
export const route: RouteHelper<RouterOptionsInput> = (handler, opts, paramsFns, returnFns, paramsId, returnId) => ({
  type: HandlerType.route,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId},
});
```

Never give a body its own signature. That was the old shape, an interface and a generic function saying the same thing, and it is two surfaces to keep in step for no gain. The Go route rules depend on it too: `helperInterfaces` in `ts-go-runtypes/internal/compiler/routerrules/routerrules.go` is the whole table, because every helper call, the framework's own built-in routes included, resolves to one of these interface call signatures.

The trailing marker parameters are written once as well, as `MarkerSlots` / `HeaderMarkerSlots` in [src/types/encoder.ts](src/types/encoder.ts), and each signature indexes that tuple. A type alias wrapped directly AROUND a marker hides it from the mion scanner; a tuple ELEMENT keeps the marker's own alias, which is why the slots are indexed rather than aliased. `opts` must stay immediately before the first marker slot: the resolver reads the options argument at (first marker index - 1).
