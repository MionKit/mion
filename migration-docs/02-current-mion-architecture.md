# mion architecture before/after the migration (router-centric)

> **Status: migration COMPLETE (on @ts-runtypes 0.9.2).** This doc was written during the
> initial spike (2026-07-11); the "spike scope" / "expected broken" items at the bottom
> (client, type-formats, binary, headersFn, routesFlow, core `jit`/`pureFns`/`aot` cleanup)
> are all DONE. See [04-progress-log.md](04-progress-log.md), [05-core-audit.md](05-core-audit.md),
> and [done/](done/). The before/after mapping below remains an accurate description of the
> current architecture.

How the pieces fit, from firsthand code reading (2026-07-11, master @ 9089d9f).

## The old pipeline (deepkit-era)

1. **`@mionjs/devtools` vite plugin** ran the deepkit type-compiler over every file (emitting runtime type metadata), extracted "pure functions" (`registerPureFnFactory` call rewriting), and generated **AOT caches** (`mion-aot-cache.json`, `virtual:mion-aot/*` virtual modules) by actually booting the app under vite-node.
2. **`@mionjs/run-types`** (deps `@deepkit/type`, `@deepkit/core`) reflected types at runtime from that metadata (`reflectFunction(handler)`) and **JIT-compiled** validators/serializers (`createJitCompiledFunction`), cached via `@mionjs/core` jitUtils (`getJitFunctionsFromHash`, hash-keyed global caches).
3. **`@mionjs/router`** consumed both through ONE seam: [`src/lib/reflection.ts`](../packages/router/src/lib/reflection.ts) — the only file in the router importing run-types. It produced `MethodReflect`:
   - `paramNames`, `hasReturnData`, `isAsync` — from the handler's `FunctionRunType`
   - `paramsJitFns` / `returnJitFns` — `JitCompiledFunctions` = `{isType, typeErrors, prepareForJson, restoreFromJson, stringifyJson, toBinary?, fromBinary?}`, each a `JitCompiledFn` wrapper (`.fn`, `.isNoop`, `.code`, hashes)
   - AOT mode branch: read everything from persisted caches instead (`getPersistedMethodMetadata`, `AOTCacheError`, `mion-build-aot` CLI)

## Where the router actually uses type functions (unchanged by the migration)

- **Registration** ([router.ts](../packages/router/src/router.ts)): `recursiveFlatRoutes` → `getExecutableFromRoute`/`getExecutableFromMiddleFn` → `getHandlerReflection(...)` → spread into the `RemoteMethod` executable.
- **Request path** ([dispatch.ts](../packages/router/src/dispatch.ts)): body is one JSON envelope `{"<routeId>": [params...]}`; per method: `paramsJitFns.restoreFromJson.fn(params)` → `paramsJitFns.isType.fn(params)` (errors via `typeErrors.fn`) → `handler(ctx, ...params)`.
- **Response path** ([routes/serializer.routes.ts](../packages/router/src/routes/serializer.routes.ts)): `stringifyJson` mode → `returnJitFns.stringifyJson.fn(returnValue)` per method into the raw body; `json` mode → `returnJitFns.prepareForJson.fn(returnValue)` (platform stringifies); `binary` mode → `toBinary`.
- Route/middleFn defs are **always factory objects** (`Route = RouteDef`; bare functions are not valid routes) built by [lib/handlers.ts](../packages/router/src/lib/handlers.ts) `route()/query()/mutation()/middleFn()/headersFn()/rawMiddleFn()` — which is what makes call-site injection possible with zero user-code changes.

## What replaced what

| Old | New |
| --- | --- |
| deepkit type-compiler transform (whole files) | `@ts-runtypes/devtools` call-site rewrite (markers on the factories) |
| `reflectFunction(handler)` at runtime | `HandlerParams<H>` / `HandlerReturn<H>` type-level extraction, resolved by tsgo at each factory call site |
| JIT compile validators/serializers at runtime | precompiled fn tuples injected as trailing args; `getRTFunction` resolves them |
| jitUtils hash caches + AOT cache layer + `mion-build-aot` | nothing — the generated `__runtypes/types/*.js` modules ARE the artifacts |
| `getParameterNames()` | labeled-tuple member names on the params runtype graph |
| `hasReturnData()` | return runtype `kind ∉ {void, never, undefined}` |
| `isAsync()` | `handler.constructor.name === 'AsyncFunction'` (dispatch always awaits; sync-fn-returning-Promise is treated as sync — acceptable) |

## Packages touched vs untouched (spike)

- **run-types**: gutted → proxy (`export * from '@ts-runtypes/core'` + [`src/mionAdapter.ts`](../packages/run-types/src/mionAdapter.ts)). deepkit deps removed.
- **router**: `lib/handlers.ts` (markers), `types/definitions.ts` (`rtFns` payload), `lib/reflection.ts` (rewritten, ~120 lines vs 520), `router.ts` (2 call sites pass the def). **dispatch.ts and serializer.routes.ts untouched.**
- **devtools**: vite-plugin dir reduced to the wrapper + `cjsPackageJsonPlugin` + legacy `virtual-modules.d.ts`; deepkit/AOT/pure-fn extraction modules deleted. eslint plugin untouched.
- **core**: untouched in the spike. Its `jit/`, `pureFns/`, `aot/` dirs are now unused by the router path (candidates for removal next); `types/formats/formats.types.ts` still type-imports run-types and keeps working through the proxy re-export (`TypeFormat`).
- **Untouched & expected broken** (out of spike scope): `client` (compiled client, jit caches, SSR AOT), `type-formats` (to be replaced by `@ts-runtypes/core/formats`), `codegen`, platform packages' tests, test-server orchestration (`serverReady` is now a resolved no-op), routesFlow pure-fn mappings.
