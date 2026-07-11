# @mionjs/core feature audit vs ts-runtypes

Requested by the maintainer: go through each core (and run-types) feature and check whether
`@ts-runtypes/core` already provides it. Verdicts: **DELETED** (removed in this branch),
**PROXY** (mion re-exports/wraps ts-runtypes), **KEEP** (genuinely mion/router-specific),
**NEXT** (goes away in a follow-up once its consumers migrate).

## @mionjs/core

| Core module | What it did | ts-runtypes equivalent | Verdict |
| --- | --- | --- | --- |
| `src/jit/jitUtils.ts` — jit fn cache (`addToJitCache`/`getJIT`/hashes) | runtime cache for JIT-compiled type fns | entry-module tuples + `rtUtils` registry (content-addressed, precompiled) | **DELETED** (file now a slim compat stub; jit/pure lookups inert) |
| `jitUtils` class registries (`setSerializableClass`, `setDeserializeFn`) | custom class (de)serialization | `registerClassSerializer` (`@ts-runtypes/core`) | **NEXT** — stub keeps them functional until callers move |
| `addAOTCaches` / `addSerializedJitCaches` / `getJitFnCaches` / `resetJitFnCaches` | restore persisted/serialized JIT caches (AOT + client wire) | none needed — generated `__runtypes` modules ARE the artifacts; client code ships via `emitMode: 'code'` | **DELETED** |
| `src/pureFns/pureFn.ts` (`registerPureFnFactory`) | mion pure-fn registry (bodyHash extracted by old plugin) | `registerPureFnFactory('ns::name', factory)` + `PureFunction`/`CompTimeArgs` brands, PFE9xxx purity checks | **DELETED** → **PROXY**: `registerMionPureFn`/`getMionPureFn`/`hasMionPureFn` (`@mionjs/run-types`, namespace `mionjs`) |
| `src/pureFns/pureServerFn.ts` (`pureServerFn`, `PURE_SERVER_FN_NAMESPACE`) | client-definable server-executable fns keyed by injected bodyHash | same registry; ids become explicit `mionjs::<name>` literals | **DELETED** — client-side mapping API redesign pending (see routesFlow note) |
| `src/pureFns/quickHash.ts` | body hashing for the above | Go-side hashing at extraction | **DELETED** |
| `src/pureFns/restoreJitFns.ts` | rebuild fns from persisted code | `materializeRTFn` inside ts-runtypes runtime | **DELETED** |
| `src/aot/*` (`aotCaches`, `serverPureFnsCaches`, empty variants + `./aot-caches`, `./server-pure-fns` subpaths) | virtual-module AOT cache loading | obsolete by construction | **DELETED** |
| `src/utils.ts` `initPureFunction` | materialize legacy pure fns | internal to ts-runtypes | **DELETED** (rest of utils.ts KEEP: `getOrCreateGlobal`, base64url, env helpers, `isMionCompileMode`…) |
| `src/routerUtils.ts` (`routesCache`, `getSerializableMethod`, `getJitFunctionsFromHash`, `getNoopJitFns`) | global method/jit-fn registry powering client metadata + binary body decoding | partially — client metadata story must be redesigned on ts-runtypes (`emitMode`, entry ids) | **NEXT** — `getNoopJitFns` stays (router uses it for raw middleFns); jit-hash serialization paths are runtime-dead |
| `src/binary/*` (dataView, bodySerializer/Deserializer) | mion binary wire format | `createBinaryEncoder/Decoder`, `createDataViewSerializer/Deserializer` | **NEXT** — swap when binary (`tb`/`fb`) is wired into the router |
| `src/types/general.types.ts` (JitCompiledFn/JitCompiledFunctions et al) | shapes the router consumes | n/a (mion-internal currency; adapter fabricates them) | **KEEP** for now; slim once binary/client migrate |
| `src/types/pureFunctions.types.ts` | legacy pure-fn shapes | ts-runtypes `CompiledPureFunction` | **NEXT** (kept so client/test-server still typecheck) |
| `errors.ts` (RpcError), `friendlyErrors.ts`, `headers.ts` (HeadersSubset), `constants.ts`, `routerUtils` route-id helpers, `utils.ts` core | mion framework concerns | ts-runtypes has `createFriendlyText` for VALIDATION messages (different layer) | **KEEP** |
| `types/formats/*` (TypeFormat aliases/params/brands) | format typing for mion | `@ts-runtypes/core` `TypeFormat*` + `/formats` subpath | **PROXY-ish** — already type-aliased through `@mionjs/run-types`; full swap with type-formats package migration |

## @mionjs/run-types

Fully **PROXY** since this branch: `export * from '@ts-runtypes/core'` + the mion adapter
(`getReflectionFromMarkers`, `buildJitFnsFromMarker`) + the pure-fn helpers (`mionjs` ns).
Nothing of the old runtime type system remains.

## routesFlow / pure-fn wire note

`RoutesFlowMapping.bodyHash` now carries the **function name** under the `mionjs` namespace
(the registry key is `mionjs::<bodyHash>`), validated/executed via `hasMionPureFn`/`getMionPureFn`.
The client-side `pureServerFn` API (refs with build-injected hashes) is deleted; the client
package must switch to explicit names + `registerPureFnFactory('mionjs::<name>', …)` when it
migrates.

## Upstream gap — FIXED (ts-run-types PR #216)

Pure-fn build extraction used to gate on the literal callee name, silently skipping RENAMED
imports and branded wrapper factories (unrenamed barrels always worked). Fixed upstream: the
extraction pre-filter also accepts calls whose first argument is a `"<ns>::<name>"`-shaped
string literal, with the brand check as the authoritative gate (Go + FE regressions; spec in
ts-run-types `docs/done/purefn-extraction-skips-reexports-and-wrappers.md`; the FE suite lives
in the renamed `packages/ts-runtypes/test/third_party/` folder). Consequence for mion:
`registerPureFnFactory('mionjs::x', …)` imported from `@mionjs/run-types` — renamed or
wrapped — gets full extraction. `registerMionPureFn('x', …)` stays runtime-lane by
construction (it computes the id, so no call-site literal exists to extract).
