# Mion AOT Caches via Distributed `globalThis` Slots

## Context

After commit `78a1d200`, the mion vite plugin in `runMode: 'middleware'` (vue/3, nuxt/4 starters) fails on first request with a cluster of four bugs documented in [mion-vite-bug.md](./mion-vite-bug.md):

1. Self-await deadlock — virtual module `load()` awaits an init promise that depends on the user code that triggered the load.
2. Fresh router instance — plugin's post-SSR `ssrLoadModule('@mionjs/router')` returns a different instance than the one the user's `api.ts` populated; basePath empty, no routes registered.
3. Empty `serverPureFnsCache` in `routesFlow` — Node's external resolver loads the empty stub instead of the plugin's virtual module, because the importer (`@mionjs/router`) is external.
4. Empty serialized router cache — same multi-instance problem as #2, observed via `aotEmitter`.

All four share one root cause: **the plugin assumed module identity across the SSR pass and post-SSR `ssrLoadModule` calls, but with externalised mion packages this is not guaranteed.** Vite's SSR module graph and Node's external resolver can produce two distinct module instances of the same package, each with its own copy of every module-level `let`/`const` binding.

The fix moves all runtime AOT cache state out of module-level bindings and onto `globalThis` — each cache module backs its state with a `Symbol.for(...)`-keyed slot, sidestepping module identity entirely. There is already precedent: [mionVitePlugin.ts:719](../packages/devtools/src/vite-plugin/mionVitePlugin.ts#L719) uses `globalThis[Symbol.for('mion.serverReady')]` to share state across module contexts in vitest with the explanatory comment "without globalThis they'd get different promise instances."

## How `globalThis` Solves the Issue (Concept Explanation)

`globalThis` is a single object that exists exactly once per Node.js process — there is no way to have two of them, regardless of how many times a module is loaded, transformed, or externalised. `Symbol.for('mion.persisted-methods/v1')` returns the same Symbol no matter who calls it (it's looked up in a process-wide registry by string key). So the slot `globalThis[Symbol.for('mion.persisted-methods/v1')]` is **one specific object**, shared by every module instance in the process.

The pattern in each cache module:

```ts
const KEY = Symbol.for('mion.persisted-methods/v1');
export const persistedMethods: MethodsCache = ((globalThis as any)[KEY] ??= {});
```

`??=` creates the globalThis slot on first use; every subsequent module-instance load returns the existing slot. So instance A's `persistedMethods` and instance B's `persistedMethods` are the **same object** — both pointers point at the slot.

**Today's flow (broken):**

```
api.ts (Vite SSR, instance A of @mionjs/router)
  └── initRouter({aotCaches})
       └── persistedMethods["foo"] = {...}    ← writes to A's module-level {}

plugin (later, ssrLoadModule, instance B of @mionjs/router)
  └── getPersistedMethods()
       └── return persistedMethods             ← reads B's empty {}
```

**With globalThis-backed slots:**

```
api.ts → initRouter({aotCaches})
  └── addToPersistedMethods("foo", {...})
       └── persistedMethods["foo"] = {...}     ← persistedMethods IS the globalThis slot

plugin → getPersistedMethods()
  └── return persistedMethods                  ← reads the SAME globalThis slot
```

Both instance A and instance B's `persistedMethods` references point at the same globalThis-backed object. **Module identity becomes irrelevant.**

### Why getter functions for some consumers

A consumer that captured a stale empty object would still see emptiness. With the slot-backed approach this *can't happen* for the slot reference itself (it's stable, identity-preserved across all loads). But the **values** at slot keys can still be added/removed, so any consumer doing `serverPureFnsCache[ns]` on first access *might* see undefined for a key that gets populated later.

Two ways to handle this:

- **Getter functions** — Replace `serverPureFnsCache[NS]?.[hash]` reads with `getServerPureFn(NS, hash)`. The function looks up the slot on every call, so it always sees the current state. Cleaner, debuggable, zero proxy overhead. **Recommended** for new code.
- **Direct object access** — Keep using `serverPureFnsCache[NS]?.[hash]`. Works fine because the slot reference is stable; reads happen at the call site and see whatever has been written since. No different from the getter functionally — just a stylistic preference.

The plan uses getter functions in `routesFlow.ts` (the per-request hot path that suffers from Bug 3) and keeps the `serverPureFnsCache` export alive for the test-server which imports it directly.

## Architecture

### Distributed globalThis slots (no central registry file)

Each existing cache module backs its own state with a `Symbol.for(...)` globalThis slot, capturing a stable reference at module load time. There is **no new central registry file** — every module owns its slot, identity-stable across all module instances.

The pattern, repeated per cache:

```ts
const KEY = Symbol.for('mion.<descriptive-name>/v1');
// Capture the slot reference at module load. ??= creates the slot on first use;
// every subsequent module-instance load returns the same object.
const slot: SlotShape = ((globalThis as any)[KEY] ??= createDefault());
```

Mutations through `slot` (e.g. `slot[key] = value`) are visible to all module instances because every instance's `slot` points at the same globalThis-backed object.

Concrete slot inventory (one `Symbol.for` per cache, all `/v1` for the initial release):

| Module | Symbol | Shape | Why it needs globalThis |
|---|---|---|---|
| [packages/core/src/jit/jitUtils.ts](../packages/core/src/jit/jitUtils.ts) | `mion.jit-fns/v1` | `Record<string, any>` | Read inside `getJitFn`/`getJIT` from external `@mionjs/run-types` callers; multi-instance otherwise diverges. |
| [packages/core/src/jit/jitUtils.ts](../packages/core/src/jit/jitUtils.ts) | `mion.pure-fns/v1` | `Record<string, any>` | Same as above. |
| [packages/core/src/aot/emptyServerPureFns.ts](../packages/core/src/aot/emptyServerPureFns.ts) | `mion.server-pure-fns/v1` | `Record<string, Record<string, any>>` | Bug 3 directly — `routesFlow.ts` (instance B of router) reads what the plugin wrote (currently lost via externalised import path). |
| [packages/router/src/lib/methodsCache.ts](../packages/router/src/lib/methodsCache.ts) | `mion.persisted-methods/v1` | `MethodsCache` | Bug 4 — `aotEmitter.getSerializedCaches()` (instance B of router) reads what `addToPersistedMethods` (instance A) wrote. |
| [packages/router/src/router.ts](../packages/router/src/router.ts) | `mion.router-state/v1` | `{ options: RouterOptions \| null; isInitialized: boolean }` | Bug 2 — `dispatchRoute()` and `routesFlow()` (instance B) read `routerOptions.basePath` etc. set by user's `initRouter` (instance A). |

**Not in globalThis:** `platformHandler`. The plugin's middleware needs the function reference, and `ssrLoadModule('@mionjs/platform-node').httpRequestHandler` is safe to use — the function's internal state lookups (router options, persisted methods) now go through globalThis, so calling instance B's handler works correctly regardless of which instance the user code populated. No need for a separate slot.

Key invariants:
- Slot **values** are mutated in place. The slot reference itself is never reassigned — anything that captured the reference keeps working. (For `setPersistedMethods` which currently reassigns, switch to in-place mutation: clear keys + `Object.assign`.)
- Reset functions stay per-module (`resetPersistedMethods`, `resetRouter`, etc.). They clear slot contents, never replace the slot reference.
- The `/v1` suffix is the contract version. If a future change reshapes a slot, bump to `/v2` — old and new can coexist; mismatched mion versions in one process simply use different slots and fail loudly when contract-incompatible APIs are called.

### User-facing API — unchanged

Users keep importing from the existing virtual module:

```ts
import { aotCaches } from 'virtual:mion-aot/caches';
initMionRouter({ aotCaches });
```

The virtual module stays. What changes is **what its `load()` hook returns in dev**: a tiny shim that reads the globalThis-backed slots, instead of awaiting an init promise (Bug 1) or returning a noop. In build mode, `load()` continues to emit hardcoded data exactly as today — no changes to the build inlining path.

Zero migration needed in starters, test-server, examples, or cloudflare workers.

### How the virtual module loads in each mode

| Mode | What `load('virtual:mion-aot/caches')` returns |
|---|---|
| Dev (no `aotData`) | A tiny module that reads each globalThis slot. Equivalent to: `export const jitFnsCache = ((globalThis)[Symbol.for('mion.jit-fns/v1')] ??= {})` etc. **No `await`** — the deadlock dissolves. |
| Build (`aotData` available) | Hardcoded data, exactly as today. |

In dev, `initRouter`'s call to `loadAOTCaches(aotCaches)` (which does `Object.assign(jitFnsCache, opts.jitFnsCache)`) becomes a harmless self-assign — the shim's `jitFnsCache` *is* the globalThis slot the assignment would write to. In build, it loads the hardcoded data into the globalThis slot at startup, exactly as the current code expects.

## Implementation Steps

Ordered so the codebase compiles after each step.

### Step 1 — Migrate `jitUtils` caches to globalThis

[packages/core/src/jit/jitUtils.ts](../packages/core/src/jit/jitUtils.ts) (lines 25–27 hold the current `jitFnsCache`/`pureFnsCache` objects). Replace:

```ts
export const jitFnsCache:  Record<string, any> = {};
export const pureFnsCache: Record<string, any> = {};
```

with:

```ts
const JIT_KEY  = Symbol.for('mion.jit-fns/v1');
const PURE_KEY = Symbol.for('mion.pure-fns/v1');
export const jitFnsCache:  Record<string, any> = ((globalThis as any)[JIT_KEY]  ??= {});
export const pureFnsCache: Record<string, any> = ((globalThis as any)[PURE_KEY] ??= {});
```

Public functions `addPureFn`, `getPureFn`, `getCompiledPureFn`, `getJitFnCaches`, `getJIT`, `getJitFn` are unchanged — they already mutate via the captured local `jitFnsCache` / `pureFnsCache` reference, which now points at the globalThis slot.

If a `resetJitFnCaches()` / similar reset helper exists, change it from reassignment to in-place clear (`for (const k in jitFnsCache) delete jitFnsCache[k]`). Captured references must stay valid.

### Step 2 — Migrate `methodsCache.persistedMethods` to globalThis

[packages/router/src/lib/methodsCache.ts](../packages/router/src/lib/methodsCache.ts) — replace `export let persistedMethods: MethodsCache = {}` (line 13) with:

```ts
const KEY = Symbol.for('mion.persisted-methods/v1');
export const persistedMethods: MethodsCache = ((globalThis as any)[KEY] ??= {});
```

Note the change from `let` to `const` — required because we never want to reassign the slot reference. This forces small refactors in the file:

- `setPersistedMethods` (line 39) currently does `persistedMethods = newCompiled`. Change to in-place:
  ```ts
  export function setPersistedMethods(newCompiled: MethodsCache) {
    for (const k in persistedMethods) delete persistedMethods[k];
    Object.assign(persistedMethods, newCompiled);
  }
  ```
- `resetPersistedMethods` (line 43): same treatment — `for (const k in persistedMethods) delete persistedMethods[k]`.
- `addToPersistedMethods` (line 17), `loadCompiledMethods` (line 66): unchanged — they already mutate.

`setPersistedMethods` is used in [reflection-aot.spec.ts](../packages/router/src/reflection-aot.spec.ts) and [reflection-optimization.spec.ts](../packages/router/src/reflection-optimization.spec.ts); no production callers. The replace-whole-map contract is preserved (callers see the same observable result).

### Step 3 — Migrate `serverPureFnsCache` to globalThis + add getter

[packages/core/src/aot/emptyServerPureFns.ts](../packages/core/src/aot/emptyServerPureFns.ts):

```ts
const KEY = Symbol.for('mion.server-pure-fns/v1');
export const serverPureFnsCache: Record<string, Record<string, any>> = ((globalThis as any)[KEY] ??= {});

/** Look up a server pure function by namespace and hash. Always reads the current globalThis slot. */
export function getServerPureFn(namespace: string, hash: string) {
  return serverPureFnsCache[namespace]?.[hash];
}

/** Merge new pure-fn entries into the cache. Called by the plugin in dev, and by an inlined module in prod builds. */
export function loadServerPureFns(entries: Record<string, Record<string, any>>) {
  for (const ns in entries) {
    serverPureFnsCache[ns] = { ...(serverPureFnsCache[ns] || {}), ...entries[ns] };
  }
}
```

Refactor [packages/router/src/routesFlow.ts:244](../packages/router/src/routesFlow.ts#L244) and [routesFlow.ts:300](../packages/router/src/routesFlow.ts#L300) to call `getServerPureFn(PURE_SERVER_FN_NAMESPACE, mapping.bodyHash)` instead of indexing the object directly. Identity-stable globalThis means the direct-import would also work, but the getter is clearer — every access uses a function so latest data is always read.

`serverPureFnsCache` export stays alive for [packages/test-server/src/test-server.ts](../packages/test-server/src/test-server.ts) which imports it directly.

### Step 4 — Move router init state into globalThis

[packages/router/src/router.ts](../packages/router/src/router.ts) — locate the module-level `let isRouterInitialized` and `let routerOptions` (around line 162). Replace with a single shared slot:

```ts
const KEY = Symbol.for('mion.router-state/v1');
type RouterState = { options: RouterOptions | null; isInitialized: boolean };
const state: RouterState = ((globalThis as any)[KEY] ??= { options: null, isInitialized: false });
```

Update reads/writes in `initRouter`, `resetRouter`, `getRouterOptions` to use `state.options` / `state.isInitialized`. The `Object.freeze(routerOptions)` line stays — freezing the options *value* is fine; it's `state.options` (the slot's property) that gets reassigned to a new frozen object on each init.

Now the plugin's existing `ssrLoadModule('@mionjs/router').getRouterOptions()` returns the correct options regardless of which router instance is loaded — both instances' `getRouterOptions()` read the same globalThis slot.

### Step 5 — Plugin's `configureServer` middleware setup

[packages/devtools/src/vite-plugin/mionVitePlugin.ts:241-260](../packages/devtools/src/vite-plugin/mionVitePlugin.ts#L241-L260):

The existing two `ssrLoadModule` calls now work correctly (because the underlying state lives in globalThis — instance B's `getRouterOptions()` and `httpRequestHandler` agree with instance A). Minimal change:

```ts
ssrInitPromise = (async () => {
  await server.ssrLoadModule(startScript); // user's initMionRouter runs, populates globalThis slots

  const routerModule   = await server.ssrLoadModule('@mionjs/router');
  const platformModule = await server.ssrLoadModule('@mionjs/platform-node');

  const opts = routerModule.getRouterOptions(); // reads from mion.router-state/v1 slot
  if (!opts) throw new Error('initMionRouter never ran in startScript');
  basePath = '/' + (opts.basePath || '').replace(/^\//, '');

  nodeRequestHandler = platformModule.httpRequestHandler; // function ref; its internal state reads come from globalThis
})();
```

No need to load `@mionjs/core` separately — the router's `getRouterOptions()` accessor already reads its own globalThis slot.

Remove the `aotResolvedIds.invalidateModule` loop (lines ~249-252) — there are no AOT virtual modules left to invalidate.

### Step 6 — Update `virtual:mion-aot/caches` `load()` to break the deadlock

[packages/devtools/src/vite-plugin/mionVitePlugin.ts:313-347](../packages/devtools/src/vite-plugin/mionVitePlugin.ts#L313-L347) — the `load()` hook for `virtual:mion-aot/*` IDs currently does `if (!aotData && initPromise) await initPromise`. **Remove the `await`.** The new behaviour:

```ts
case 'caches': {
  if (aotData) return generateCombinedCachesModule(); // build path — unchanged
  // Dev path: return a tiny module that reads globalThis slots directly. No awaits.
  return `
    const JIT_KEY  = Symbol.for('mion.jit-fns/v1');
    const PURE_KEY = Symbol.for('mion.pure-fns/v1');
    const ROUTER_KEY = Symbol.for('mion.persisted-methods/v1');
    export const jitFnsCache  = (globalThis[JIT_KEY]    ??= {});
    export const pureFnsCache = (globalThis[PURE_KEY]   ??= {});
    export const routerCache  = (globalThis[ROUTER_KEY] ??= {});
    export const aotCaches = { jitFnsCache, pureFnsCache, routerCache };
  `;
}
```

Apply the same shape to the sub-virtuals (`jit-fns`, `pure-fns`, `router-cache`) — each emits a tiny module reading its respective globalThis slot.

**Bug 1 deadlock dies here** — no `await` inside `load()` means no cycle, regardless of when api.ts evaluates relative to `ssrInitPromise`.

The `generateCombinedCachesModule` / `generateNoopCombinedModule` / individual `generate*Module` helpers in [aotCacheGenerator.ts](../packages/devtools/src/vite-plugin/aotCacheGenerator.ts) stay — they're still used in build mode.

### Step 7 — `serverPureFnsCache` plugin write path (fixes Bug 3)

This is the trickier piece. The current path (broken in dev with externalised router):

1. Plugin marks `@mionjs/core/server-pure-fns` as `ssr.noExternal` so Vite stays in the resolution chain.
2. Plugin's `resolveShimModule` rewrites that import to `virtual:mion-server-pure-fns`.
3. Plugin's `load()` returns a hardcoded module with all extracted pure functions.

**Why it breaks in dev:** when `@mionjs/router` is externalised, Node loads `routesFlow.ts` directly. Node sees `import '@mionjs/core/server-pure-fns'` and resolves it via `@mionjs/core/package.json`'s `exports` map → `serverPureFnsCaches.ts` → `emptyServerPureFns.ts`. Vite's `ssr.noExternal` doesn't help because Vite is not in the loading chain at all.

**Two-mode fix:**

- **Dev mode**: Stop relying on the import interception. From `configureServer`'s SSR pass (after `loadModule(startScript)`), call `loadServerPureFns(extractedEntries)` directly. This populates `globalThis[Symbol.for('mion.server-pure-fns/v1')]`. `routesFlow.ts` (instance B, externalised) reads from the same slot via `getServerPureFn(...)` and finds the data. Bug 3 fixed.

  In dev, the `virtual:mion-server-pure-fns` virtual module never gets loaded (the externalised importer chain bypasses it), and that's fine — we don't need it to.

- **Build mode**: The build-time path still works (everything is bundled — Vite is in the chain, `ssr.noExternal` applies). Keep the virtual module. Change its emitted source from `export const serverPureFnsCache = {...}` to a side-effect populate:
  ```ts
  // What virtual:mion-server-pure-fns emits in build:
  import { loadServerPureFns } from '@mionjs/core/server-pure-fns';
  loadServerPureFns({
    '__pure_server_fn': {
      '<bodyHash1>': { fn: function(){...}, /*...*/ },
      // ...
    }
  });
  // Re-export for back-compat:
  export { serverPureFnsCache } from '@mionjs/core/server-pure-fns';
  ```
  At bundle init time, `loadServerPureFns` runs, populating globalThis. `routesFlow.ts` (now in the same bundle) reads the populated slot. Works.

Concretely:
- Add the dev-mode `loadServerPureFns(entries)` call in [mionVitePlugin.ts](../packages/devtools/src/vite-plugin/mionVitePlugin.ts) `configureServer` after `loadSSRRouterAndGenerateAOTCaches` resolves and the extracted pure-fn list is known.
- Update `generateServerPureFnsVirtualModule` in [packages/devtools/src/vite-plugin/virtualModule.ts](../packages/devtools/src/vite-plugin/virtualModule.ts) to emit the side-effect populate form for build mode.
- Keep `addSsrNoExternal([SERVER_PURE_FNS_SHIM])` and `resolveShimModule` — they still fire in build.

### Step 8 — HMR reset wiring

[mionVitePlugin.ts:484-491](../packages/devtools/src/vite-plugin/mionVitePlugin.ts#L484-L491) — `handleHotUpdate` currently does `ssrLoadModule('@mionjs/router'); routerModule.resetRouter()`. With globalThis backing this *now works correctly* (instance B's `resetRouter()` clears the same globalThis slot instance A reads), so no rewrite is strictly required. Tidy-up: keep the call, but additionally clear `persistedMethods` and `serverPureFnsCache` (preserve `jitFnsCache` and `pureFnsCache` — expensive to rebuild). Either inline the resets, or expose `resetRouter()` to also clear those slots.

### Step 9 — Rebuild devtools

Per [CLAUDE.md](../CLAUDE.md): `npm run build -w @mionjs/devtools` after any plugin change before testing in other packages.

## Critical files to modify

- [packages/core/src/jit/jitUtils.ts](../packages/core/src/jit/jitUtils.ts) — globalThis-backed `jitFnsCache`, `pureFnsCache`
- [packages/core/src/aot/emptyServerPureFns.ts](../packages/core/src/aot/emptyServerPureFns.ts) — globalThis-backed `serverPureFnsCache`, add `getServerPureFn`, `loadServerPureFns`
- [packages/router/src/lib/methodsCache.ts](../packages/router/src/lib/methodsCache.ts) — globalThis-backed `persistedMethods`, `let` → `const`, in-place mutations in setters/resets
- [packages/router/src/router.ts](../packages/router/src/router.ts) — `routerOptions` and `isRouterInitialized` into a single shared globalThis slot
- [packages/router/src/routesFlow.ts](../packages/router/src/routesFlow.ts) — switch to `getServerPureFn` at lines 244 and 300
- [packages/devtools/src/vite-plugin/mionVitePlugin.ts](../packages/devtools/src/vite-plugin/mionVitePlugin.ts) — change `virtual:mion-aot/*` `load()` to read globalThis (no awaits) in dev; drop `aotResolvedIds.invalidateModule` loop; add direct `loadServerPureFns()` call from `configureServer` for dev pure-fn population; tidy HMR reset
- [packages/devtools/src/vite-plugin/virtualModule.ts](../packages/devtools/src/vite-plugin/virtualModule.ts) — change `generateServerPureFnsVirtualModule` to emit a side-effect populate (`loadServerPureFns(...)`) instead of an exported object, for build mode
- No user-facing API changes; no in-repo consumer migrations.

## Test impact triage

Most of the suite should pass unchanged because the public APIs (`addPureFn`, `getPersistedMethods`, `getServerPureFn`, `getRouterOptions`, `dispatchRoute`, `httpRequestHandler`) keep their signatures and observable semantics. Within-worker cross-test bleed is no worse than today — module-level state already persisted across tests in the same Vitest worker.

The places to look first when triaging breakages:

### 1. Router tests using `setPersistedMethods` reference semantics

[packages/router/src/reflection-aot.spec.ts](../packages/router/src/reflection-aot.spec.ts) (~15 callsites) and [packages/router/src/reflection-optimization.spec.ts](../packages/router/src/reflection-optimization.spec.ts) (1 callsite) use `setPersistedMethods` heavily. The semantics shift from **"replace reference"** to **"in-place mutation"**:

- Before: `setPersistedMethods(newMap)` reassigned the local `persistedMethods` variable. Anything holding the old reference saw the old contents.
- After: `setPersistedMethods(newMap)` clears and refills the same slot. Anything holding the reference sees the new contents.

**Triage**: scan both spec files for any pattern where a reference to `persistedMethods` is captured *before* `setPersistedMethods` is called, then asserted to still hold old values. If found, the test was relying on reference-replacement; rewrite it to capture content snapshots, not references.

### 2. Devtools plugin tests with snapshot assertions

[packages/devtools/](../packages/devtools/) tests that:
- Snapshot the source emitted by `load('virtual:mion-aot/caches')` — re-snapshot with the new globalThis-reading shim.
- Assert behavior of `aotResolvedIds.invalidateModule` loop in `configureServer` — the loop is removed; these become no-ops or can be deleted.
- Mock or assert the `virtual:mion-server-pure-fns` resolution path in dev — the plugin now populates globalThis directly via `loadServerPureFns()` instead. Update mocks to assert the direct call.

### 3. Vitest `isolate: true` cross-file pollution

This is the only **new** isolation behavior. Today, with vitest's `isolate: true` (default), each test file's `let jitFnsCache = {}` is a fresh empty object because Node's module cache is cleared between files. After this change, `globalThis[Symbol.for('mion.jit-fns/v1')]` survives the module-cache reset and persists for the worker's lifetime — test file B sees file A's jit cache contents.

**Triage**: any test file whose first assertion is "the cache is empty at startup" without an explicit reset is now flaky. Fix by adding `beforeAll(() => { resetPersistedMethods(); /* and equivalents */ })` at the top, or running those projects with `pool: 'forks'` + `singleFork: false`.

The existing precedent (`Symbol.for('mion.serverReady')` at [mionVitePlugin.ts:719](../packages/devtools/src/vite-plugin/mionVitePlugin.ts#L719)) confirms globalThis works in mion's vitest config — but its goal was the *opposite* (sharing across contexts). For caches, isolation is what we want.

### 4. Integration tests (test-server, platform-node, e2e)

These exercise the full request flow. They're the strongest signal of correctness — if they pass, the wiring is right. They're also the least likely to need code changes because they exercise public surface only. Run these LAST in the triage; they'll either confirm the fix or surface anything missed.

### Triage workflow

1. Run `npx vitest run --project router` — expect breakages in the two reflection spec files. Fix per (1) above.
2. Run `npx vitest run --project devtools` — expect snapshot diffs. Re-snapshot per (2) above.
3. Run `npx vitest run --project core` — expect minimal breakage. Any cross-file isolation issues surface here per (3).
4. Run `npm run test` — full suite. Anything still failing is likely a hidden cross-file isolation case.
5. Run starter e2e per "Bug reproductions" below — final integration confirmation.

Estimated triage effort: half a day to a day on top of implementation.

## Verification

### Per-package tests

```bash
npm run build -w @mionjs/devtools           # rebuild plugin (required by CLAUDE.md)
npx vitest run --project core               # globalThis slots in jitUtils, server-pure-fns
npx vitest run --project router             # methodsCache, router state, routesFlow
npx vitest run --project devtools           # plugin
npm run test                                # full suite
```

### Bug reproductions (fixes Bug 1–4)

```bash
cd /Users/majerez/Projects/mion-starters/vue/3
rm -rf node_modules/.vite
DEBUG_AOT=1 npm run dev
# Expected:
#   - No 60s timeout (Bug 1 fixed)
#   - "[mion] SSR AOT caches generated successfully" then "[mion] Dev server proxy initialized"
#   - DEBUG_AOT log shows non-empty routerCache (Bug 4 fixed)

# In another terminal:
curl -X POST -H 'Content-Type: application/json' \
  -d '{"hello":["Test"]}' http://localhost:5173/api/mion/hello
# Expected: 200 OK with hello response (Bug 2 fixed)

npm test
# Expected: all e2e pass, including orders/event-timeline (Bug 3 fixed)
```

Repeat for `nuxt/4`. nextjs/16 should still work unchanged (it never hit these bugs).

### Cross-instance smoke test

A targeted unit test that verifies module identity is no longer required:

```ts
// packages/router/src/lib/methodsCache.spec.ts
it('persistedMethods is shared across module instances', async () => {
  const a = await import('./methodsCache.ts');
  delete (require.cache as any)[require.resolve('./methodsCache.ts')]; // force re-import
  const b = await import('./methodsCache.ts');
  a.setPersistedMethods({ foo: { /* ... */ } as any });
  expect(Object.keys(b.getPersistedMethods())).toContain('foo');
});
```

Same shape for `jitFnsCache` and `serverPureFnsCache`.

### Pre-publish verification

`bash scripts/pre-publish-test.sh` — full e2e build + consumer-project test, per CLAUDE.md. Required before any tarball regeneration for the starters.
