# Migration plan — run-types → @ts-runtypes/core

## The one architectural shift

Old model: `@mionjs/devtools` ran the deepkit type-compiler over every file so `@mionjs/run-types` could **reflect handler functions at runtime** (`reflectFunction(handler)`) and JIT-compile validators/serializers, with an AOT cache layer on top to skip that at prod boot.

New model: **no runtime reflection exists.** The `@ts-runtypes/devtools` vite plugin rewrites *call sites* of functions that declare trailing injection-marker params, injecting precompiled function tuples. Everything is AOT by construction — the entire mion AOT cache layer (devtools aotCacheGenerator, router aotCacheLoader/aotEmitter, core jit hashes, `mion-build-aot`) becomes obsolete.

The injection point is mion's own `route()` / `query()` / `mutation()` / `middleFn()` factories ([packages/router/src/lib/handlers.ts](../packages/router/src/lib/handlers.ts)). Since mion routes are **always** declared through these factories (`Route = RouteDef`, bare handlers are not valid routes), every existing user call site gets build-time types with **zero user-code changes**.

## Verified by standalone smoke test (scratchpad, 2026-07-11)

A minimal external consumer project (vendored tarballs + local binary, vite plugin under vitest) proved:

- A wrapper `route<H>(handler, fns?: InjectTypeFnArgs<…>)` declared in a *separate module* gets its call sites rewritten with zero plugin config.
- Type-level extraction **resolves at the call site**: `Parameters<H> extends [any, ...infer P] ? P : []` (ctx-slicing) and `Awaited<ReturnType<H>>`, including inferred generic `H` from arrow-function args, async handlers, and inferred object-literal returns.
- Multi-slot markers work: two `InjectTypeFnArgs` + two `InjectRunTypeId` params each get their own positional injection.
- Injected shape: multi-key marker → **array of entry tuples** (declaration order); single-key marker → the **bare tuple** (no array).
- `val` validates the params tuple, `verr` gives `{path: [0,'name'], expected}` errors, `rj` revives `Date`/`bigint` from parsed JSON, `pjs` prepares values for JSON, forwarded `getRunTypeId` returns stable ids.
- The params-tuple runtype graph carries **labeled tuple names** (`children[].name` = real parameter names) → replaces `getParameterNames()`.

## Mapping old jit surface → new fn keys

`MethodReflect`/`JitCompiledFunctions` ([core general.types.ts:185](../packages/core/src/types/general.types.ts)) stays the router's internal currency; only how it's produced changes.

| mion `JitCompiledFunctions` slot | ts-runtypes fnKey | note |
| --- | --- | --- |
| `isType.fn` | `val` | `ValidateFn` |
| `typeErrors.fn` | `verr` | same `{path, expected, format?}` error shape (shared lineage) |
| `prepareForJson.fn` | `pj` | mutate-walk keeps old in-place semantics |
| `restoreFromJson.fn` | `rj` | request params revival |
| `stringifyJson.fn` | `sj` | direct value→string |
| `toBinary`/`fromBinary` | `tb`/`fb` | **out of spike scope** |

Adapter wraps each compiled fn in a minimal `JitCompiledFn`-shaped object (`{fn, isNoop:false, typeName, jitFnHash, …}`) so dispatch/serializer code (`.fn`, `.isNoop` reads) is untouched.

Other `MethodReflect` fields:
- `paramNames` ← params runtype graph tuple labels.
- `hasReturnData` ← return runtype kind ∉ {void, undefined, never}.
- `isAsync` ← `handler.constructor.name === 'AsyncFunction'` (dispatch always awaits anyway; sync-fn-returning-promise edge documented).
- `paramsJitHash`/`returnJitHash` ← the injected type ids (stable, content-addressed).

## Changes by package

### `@mionjs/run-types` → proxy (gutted)
- Delete the deepkit runtime type system (`src/` JIT compilers, nodes, mocking) and its deps (`@deepkit/core`, `@deepkit/type`).
- New surface: re-export `@ts-runtypes/core` (markers, factories, `getRTFunction`, `getRunType(Id)`, RunType types, formats) + a mion adapter module (`buildMionJitFns`, `getReflectionFromRtFns`) producing the core-shaped `JitCompiledFunctions`/reflection data from injected marker payloads.

### `@mionjs/router` (minimal touch)
- `lib/handlers.ts`: factories gain trailing marker params (`InjectTypeFnArgs<HandlerParams<H>, 'val','verr','pj','rj','sj'>`, same for return + two `InjectRunTypeId`) and stash them on the def as `rtFns`.
- `types/definitions.ts`: defs carry `rtFns?`.
- `lib/reflection.ts` (the ONLY run-types import in the router): rewritten to build `MethodReflect` from `rtFns` via the proxy — no dynamic module loading, no AOT branches.
- `router.ts`: pass the def (not just the handler) to reflection at the 2 call sites.
- `headersFn` routes + binary serializer + routesFlow pure-fn mappings: **deferred** (throw/degrade with clear message; documented in progress log).

### `@mionjs/devtools`
- `mionVitePlugin` becomes a thin wrapper over `@ts-runtypes/devtools/vite`; accepts the legacy option shape (`{runTypes:{tsConfig}}`) so the ~20 existing vite/vitest configs keep working unmodified; resolves the resolver binary via `TS_RUNTYPES_BIN` env → sibling `../ts-run-types/bin/ts-runtypes` → `getExePath()`.
- Delete deepkit transformer + AOT cache generator + pure-fn extractor modules and the `@deepkit/type-compiler` dep.
- Keep: eslint plugin, `cjsPackageJsonPlugin`, `serverReady` (compat no-op).

### tsconfig
- Root `tsconfig.json`: add `customConditions: ["source"]` so the resolver's tsgo program resolves `@mionjs/*` cross-package imports to TS source (mirrors ts-run-types' own setup); the deepkit `"reflection"` flag can be dropped once everything migrates.
- `.gitignore`: `__runtypes/` (plugin-generated cache modules next to each package's sources).

### Out of spike scope (documented, expected broken)
`client` (compiled client + jit caches), `type-formats` (to be replaced by ts-runtypes formats), `codegen`/AOT commands, `platform-*` test suites, routesFlow mappings, binary serializer, headersFn middleFns, core's `jit`/`pureFns`/`aot` dirs (left in place but unused by the new path).

## Phases

1. ✅ Vendor tarballs + deps + pnpm policy (done)
2. run-types proxy + adapter
3. router factories/defs/reflection rewrite
4. devtools wrapper + rebuild
5. Basic route spec green under vitest (validate + restore + stringify)
6. Broader router suite triage → progress log
7. Commit, push, hand off (0.9.1 publish checklist in README)
