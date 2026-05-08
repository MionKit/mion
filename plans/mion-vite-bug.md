# mion vite plugin — middleware-mode bug report

## Context

After commit `78a1d200` ("refactor AOT caches functionality so users have to manually import them, this let us leave all mion packages marked as external by rollup"), the **mion vite plugin in `runMode: 'middleware'`** fails silently (or near-silently) on first request. This affects starters `vue/3` and `nuxt/4`. `nextjs/16` is unaffected because it uses Turbopack with a manual shim file (`nextjs/16/mion-aot-caches-shim.js`) and runs the API on a separate `vite-node` process (which uses `runMode: 'childProcess'`-style invocation, **not** middleware).

All bugs share a common root cause: **Vite SSR loads externalized packages via Node's resolver, bypassing the plugin's `resolveId` / `load` interception**. Each `ssrLoadModule` call from the plugin can return a fresh module instance separate from the one the user's start script is already using. The mion plugin's middleware-mode flow assumed module identity across these calls.

The `78a1d200` commit removed the `AOT_CACHES_SHIM` indirection — previously the router internally imported a shim that the plugin replaced with a virtual module, which forced Vite to process the router (so the plugin's interception fired). Now the user imports `aotCaches` directly in their own code, so the router can be fully external, but other internal shims (`@mionjs/core/server-pure-fns`) still rely on Vite-side interception that no longer happens.

## Reproduction setup

- `vue/3` starter: `vite.config.ts` configures `mionVitePlugin({ aotCaches: true, serverPureFunctions: { clientSrcPath: '../app' }, server: { runMode: 'middleware', startScript: 'api/src/server.node.ts' } })`.
- `npm run dev` → Vite serves SPA + mion API as middleware on port 5173.
- E2e tests at `vue/3/e2e/smoke.test.ts` exercise: homepage, hello, getTime, orders showcase (uses `routesFlow` + `mapFrom`).

`nuxt/4` is structurally identical (single Vite-backed dev server, middleware mode). Both fail.

## Bugs (in the order they surface during a fresh `npm run dev` → first request)

### Bug 1 — Self-await deadlock when the start script imports `virtual:mion-aot/caches`

**Mode**: `runMode: 'middleware'` (vue/3, nuxt/4). Does not affect `buildOnly` / `childProcess` (different code path) or next.js (no middleware).

**Symptom**: Dev server logs `[mion] Generating SSR AOT caches...`, banner appears, then ~60 seconds of silence, then:
```
[vite] (ssr) Error when evaluating SSR module .../api/src/server.node.ts:
  transport invoke timed out after 60000ms
  data: ["/@id/__x00__virtual:mion-aot/caches.ts","/.../api/src/api.ts",{"cached":false,"startOffset":2}]
[mion] Failed to initialize SSR: transport invoke timed out after 60000ms
```
After this, `nodeRequestHandler` is never set; every request to `/api/mion/*` hangs on `await ssrInitPromise` inside the dev proxy middleware (`mionVitePlugin.ts:271`) and eventually the browser sees `net::ERR_ABORTED`.

**Cause**: Cyclic await between `configureServer` and the virtual module's `load()` hook.
- `configureServer()` (`mionVitePlugin.ts:241-242`) sets `ssrInitPromise = loadSSRRouterAndGenerateAOTCaches(ssrLoadModule, startScript, ...)`.
- That helper (in `aotCacheGenerator.ts:214-242`) does `await loadModule(startScript)`. With the new commit, `api.ts` (loaded transitively by `server.node.ts`) does `import { aotCaches } from "virtual:mion-aot/caches"`.
- The plugin's `load()` for the resolved virtual ID (`mionVitePlugin.ts:313-347`) does `if (!aotData && initPromise) await initPromise;` — and `initPromise` *is* `ssrInitPromise`, the very thing we are inside of.
- 60 s later Vite's transport gives up and rejects with the timeout shown above.

**Why it didn't bite before `78a1d200`**: prior to the refactor, `api.ts` did **not** import the virtual module — the router pulled an empty cache shim internally, which the plugin replaced via `resolveId`. The cycle never formed.

**Where**: `packages/devtools/src/vite-plugin/mionVitePlugin.ts:230-287` (`configureServer`) and `:313-347` (`load` hook for AOT virtual modules).

---

### Bug 2 — `ssrLoadModule('@mionjs/router')` after the SSR pass returns a *fresh, empty* router instance

**Mode**: `runMode: 'middleware'` (vue/3, nuxt/4). Surfaces only after Bug 1 is worked around.

**Symptom**: The dev server appears healthy: `[mion] SSR AOT caches generated successfully` followed by `[mion] Dev server proxy initialized`. But every request to `/api/mion/*` returns:
```
HTTP 500
{"@thrownErrors":{"mion@platformError":{"type":"unknown-error","publicMessage":"Unknown Error"}}}
```
With `console.error` added inside platform-node's `httpRequestHandler` catch, the underlying error is:
```
RpcError: Not-found route is not registered. This should never happen.
  type: 'not-found', statusCode: 422
```
Diagnostic prints inside `configureServer` show:
```
mion router initialized { routerOptions: { basePath: 'api/mion', ... } }     ← from initRouter, instance A
[mion-debug] router after SSR — size: 0  basePath: ''                         ← from ssrLoadModule, instance B
```

**Cause**: `configureServer()` does:
```ts
const routerModule = await server.ssrLoadModule('@mionjs/router');
const opts = routerModule.getRouterOptions();
basePath = '/' + (opts.basePath || '').replace(/^\//, '');
const platformNode = await server.ssrLoadModule('@mionjs/platform-node');
nodeRequestHandler = platformNode.httpRequestHandler;
```
Both `ssrLoadModule` calls return module instances **distinct** from the ones loaded transitively when `loadSSRRouterAndGenerateAOTCaches` evaluated `server.node.ts → api.ts`. The user's `initMionRouter` populated instance A's `flatRouter` / module-level state; the plugin reads instance B's empty state.

The *function reference* `nodeRequestHandler` captured here is from instance B of `@mionjs/platform-node`, whose `import { dispatchRoute } from '@mionjs/router'` is bound at module load time to instance B of the router — i.e. a router with zero registered routes. Hence "Not-found route is not registered."

**Why instance B is fresh**: With external mion packages (default in Vite SSR), Vite's `ssrLoadModule` resolves the bare specifier through one path during the user's `import` rewrite (which goes through Node's resolver of the external module from inside Vite's SSR runner) and through a different path when the plugin calls `server.ssrLoadModule('@mionjs/router')` directly. The two paths end up in separate cache buckets even though they resolve to the same file on disk. (Confirmed empirically — `routerModule.getRouterOptions().basePath` is empty even though `initRouter` ran a few ms earlier with `basePath: 'api/mion'`.)

**Why also `invalidateModule` made this worse**: The original code did
```ts
for (const resolvedId of aotResolvedIds.keys()) {
  const mod = server.moduleGraph.getModuleById(resolvedId);
  if (mod) server.moduleGraph.invalidateModule(mod);
}
```
right before the second `ssrLoadModule`. `invalidateModule` cascades to importers, so even when a fix to Bug 1 returned a real (instead of noop) module from `load()`, the AOT virtual modules' invalidation invalidated `api.ts` → server.node.ts → and made the second `ssrLoadModule` reload a fresh router with empty state. Removing the invalidation alone does not fix this, however — the cache-bucket mismatch above is the deeper cause.

**Where**: `packages/devtools/src/vite-plugin/mionVitePlugin.ts:248-260`.

---

### Bug 3 — `routesFlow` cannot find user pure functions (`mapFrom`, `pureServerFn`, `registerPureFnFactory`)

**Mode**: `runMode: 'middleware'` (vue/3, nuxt/4). Surfaces only after Bugs 1 + 2 are worked around. Affects any starter that uses `routesFlow` + user pure functions in their pages.

**Symptom**: `/mion-orders` page renders the heading but shows two errors instead of orders:
```
API Error: listOrders: Unknown Error (unknown-error)
API Error: getOrdersEvents: Unknown Error (unknown-error)
```
With logging added to platform-node's catch, the dev server emits:
```
[mion platform-node] dispatch error for /api/mion/mion-routes-flow :
  RpcError: Mapping pure function 'mapFromOrdersToOrderEvents' not found.
  Ensure the function is registered on the server.
  type: 'routesFlow-mapping-missing-pure-fn', statusCode: 422
```
This happens for *any* pure function the user writes in their app code.

**Cause**: `packages/router/src/routesFlow.ts:18` does
```ts
import { serverPureFnsCache } from '@mionjs/core/server-pure-fns';
```
The plugin is supposed to intercept this import (`SERVER_PURE_FNS_SHIM` is in `addSsrNoExternal`, and `resolveShimModule` in `mionVitePlugin.ts:629-669` rewrites it to the `virtual:mion-server-pure-fns` virtual module that `generateServerPureFnsVirtualModule` populates with extracted pure functions).

But the importer here is `@mionjs/router` itself, which is **externalized** in Vite SSR. When the user's `api.ts` (Vite-processed) imports `@mionjs/router`, Vite externalises the router; Node loads it directly from `node_modules/@mionjs/router/.dist/esm/...`; Node sees `import '@mionjs/core/server-pure-fns'` and resolves it via the `exports` map in `@mionjs/core/package.json`:
```json
"./server-pure-fns": {
  "default": "./.dist/esm/src/aot/serverPureFnsCaches.js"
}
```
Which re-exports `serverPureFnsCache` from `emptyServerPureFns.ts` — a literal `{}`. The plugin's `resolveId` is never consulted because the importer is external; `ssr.noExternal` of the shim is irrelevant when Node, not Vite, drives resolution.

So the runtime `routesFlow.ts` ends up holding an empty `serverPureFnsCache`, and every user `mapFrom` / `pureServerFn` lookup fails.

**Why it didn't bite before `78a1d200`**: same root cause as Bug 1 — the previous design forced the router to be Vite-processed (because the AOT cache was wired through a similar shim), which kept the plugin in the resolution path for the pure-fns shim too. After the refactor, the router is fully external, and only the user-imported AOT caches keep the plugin in scope.

**Where**: `packages/router/src/routesFlow.ts:18` (the import that breaks); `packages/core/src/aot/emptyServerPureFns.ts` (the stub Node loads instead of the plugin's virtual module); `packages/devtools/src/vite-plugin/mionVitePlugin.ts:163` and `:629-669` (interception that no longer fires).

---

### Bug 4 (related) — `routerCache` in the SSR pass is empty (`2 B = '{}'`)

**Mode**: `runMode: 'middleware'`.

**Symptom**: `DEBUG_AOT=1 npm run dev` shows:
```
[mion]   jitFns: 136.6 KB, pureFns: 28.1 KB, routerCache: 2 B
[mion] AOT routerCache:
 {}
```
JIT and pure caches populate but the router methods cache is `{}`.

**Diagnosis**: `aotEmitter.ts:53-57` calls `getPersistedMethods()` which reads the module-level `persistedMethods` from `methodsCache.ts`. `addToPersistedMethods` only writes when `shouldCompile()` (i.e. `MION_COMPILE` is set). Even though `MION_COMPILE='middleware'` *is* set during `loadModule(startScript)`, the resulting `persistedMethods` retrieved via `loadModule('@mionjs/router/aot')` reads from a different module instance than the one that `api.ts → @mionjs/router` populated — exactly the same multi-instance issue as Bug 2, just observed via a different lens (via the `aot` sub-export rather than via the main package).

**Effect on its own**: a 2-byte routerCache means every consumer (notably the *client* bundle) gets an empty router cache on startup. In dev this manifests as routes being recompiled on first hit; the bigger downstream impact is unclear and tangled with Bug 2/3 since middleware mode currently can't reach the runtime path anyway.

**Where**: `packages/router/src/lib/aotEmitter.ts:53-57` (read), `packages/router/src/lib/methodsCache.ts:13-19` (write), `packages/devtools/src/vite-plugin/aotCacheGenerator.ts:233-235` (the cross-instance read).

---

## Summary of triggering conditions

| Bug | `nextjs/16` | `vue/3` | `nuxt/4` | When it triggers |
|---|---|---|---|---|
| 1 — self-await deadlock | ✅ unaffected | ❌ | ❌ | First load; user's `api.ts` imports `virtual:mion-aot/caches` while plugin is inside `loadSSRRouterAndGenerateAOTCaches`. |
| 2 — fresh router instance | ✅ unaffected | ❌ | ❌ | First request after SSR pass completes; `ssrLoadModule('@mionjs/router' \| '@mionjs/platform-node')` returns empty instance. |
| 3 — empty `serverPureFnsCache` in routesFlow | ✅ unaffected | ❌ | ❌ | Any request hitting a `routesFlow` route that uses user-defined `mapFrom` / `pureServerFn`. |
| 4 — empty serialized `routerCache` | ✅ unaffected | ❌ | ❌ | Always when middleware-mode SSR pass completes; downstream impact masked by Bug 2/3. |

Next.js is unaffected because:
- It uses Turbopack for the app server (no Vite plugin involved on the client side; AOT caches resolve to a hand-written shim via `next.config.ts` `turbopack.resolveAlias`).
- It runs the mion API on a **separate `vite-node` process** (`api/src/dev-server.ts`), which is `MION_COMPILE`-style child process invocation, not middleware. Module identity is preserved within that single child process.

## Common root cause

Each bug is one face of a single architectural issue: **the mion vite plugin assumes module identity across the SSR pass and post-SSR `ssrLoadModule` calls, but with externalized mion packages this assumption no longer holds.** The `78a1d200` refactor was a reasonable goal (clean rollup externals, no AOT shim indirection), but it removed the one mechanism that was implicitly keeping `@mionjs/router` Vite-processed.

Two architectural directions worth evaluating before committing to a fix:

1. **Force `@mionjs/router` (and any other mion package that imports a plugin-managed shim) into `ssr.noExternal`** in middleware mode. This guarantees Vite drives all resolution and the plugin's `resolveId` interception works. Cost: Vite has to process the router's compiled JS through the plugin pipeline; possible interaction with the deepkit transform and source maps.

2. **Stop relying on import interception altogether**. Use `globalThis` (under `Symbol.for('mion.…')`) as the canonical channel for shared state — the plugin's virtual module writes into it, the stub reads from it, and `httpRequestHandler` / `basePath` are published by the platform / router on first init. This sidesteps Vite's externalization rules entirely. Cost: extra indirection, and a small contract that has to be respected by every mion package that participates in middleware-mode dev.

3. **Drop middleware mode for these starters and standardize on `childProcess`**. Next.js already does this implicitly. The trade-off is an extra dev-time process and a proxy hop, but module identity becomes a non-issue because everything runs inside one persistent child.

Each option has different blast radius — recommend a separate investigation pass before picking one.

## Verification commands (for the next investigation)

```bash
# Reproduce all four bugs:
cd /Users/majerez/Projects/mion-starters/vue/3
rm -rf node_modules/.vite
DEBUG_AOT=1 npm run dev   # observe the 60s timeout (Bug 1)
# After Bug 1 worked around, in another terminal:
curl -X POST -H 'Content-Type: application/json' \
  -d '{"hello":["Test"]}' http://localhost:5173/api/mion/hello   # 500 (Bug 2)
# After Bug 2 worked around, run e2e:
npm test   # orders/event-timeline tests fail (Bug 3)
# routerCache size visible in DEBUG_AOT log every run (Bug 4)
```

Reverting all in-progress fixes (mion repo + starters):
```bash
cd /Users/majerez/Projects/mion && git checkout -- . && git clean -fd packages/
cd /Users/majerez/Projects/mion-starters && git checkout -- .
```

(Tarballs in `mion-starters/mion-tarballs/` are stale fixed-up builds; rebuild from the reverted mion source with `bash scripts/pack-packages.sh --dest /Users/majerez/Projects/mion-starters/mion-tarballs` before re-running starters.)
