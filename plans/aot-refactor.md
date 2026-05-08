# 0.9 — AOT caches refactor: Drizzle-style constructor-arg passing

## TL;DR

Replace the current "virtual module emits side-effect imports that mutate `@mionjs/core` and `@mionjs/router` module-level globals" pattern with **explicit imports + constructor-arg passing**, modeled on Drizzle ORM (which is also mion's default ORM).

End-state user code:

```ts
// SERVER
import * as aotCaches from 'virtual:mion-aot/caches';
await initMionRouter(routes, { aotCaches });

// CLIENT
import * as aotCaches from 'virtual:mion-aot/caches';
const { client, routes, middleFns } = initClient<MyApi>({ baseURL, aotCaches });

// STANDALONE @mionjs/run-types — manual loaders kept exposed
import * as aotCaches from 'virtual:mion-aot/caches';
import { loadAOTCaches } from '@mionjs/core';
loadAOTCaches(aotCaches);
```

Side benefits:
- Every `@mionjs/*` package can be **external** in consumer builds (no `noExternal`, no metadata-export constraints on `@mionjs/platform-*`).
- Multiple router/client instances in one process work cleanly (drizzle's #283 fix via `Symbol.for("mion:registry")`).
- Consumer `vite.config` reduces to a single `mionVitePlugin(...)` plugin entry — no manual `ssr.noExternal`, no `rollupOptions.external` overrides.
- Virtual module shared safely by client and server builds (no router-side imports inside it anymore).

This is a **breaking change** released as **0.9.0**.

---

## 1. Why this change

The current build-error trigger:

```
apps/src/mionAppNode.ts (8:49): "__ΩNodeHttpOptions" is not exported by "node_modules/@mionjs/platform-node/.dist/esm/index.js"
```

was the surface symptom of a deeper architectural issue. To make the AOT virtual module's side-effect calls (`addAOTCaches`, `addRoutesToCache`) reach the right module-level state, consumers had to bundle every `@mionjs/*` package — including `@mionjs/platform-node`, which intentionally ships **without** deepkit `__Ω*` reflection metadata (platform adapters don't need reflection). Once bundled, rollup walked platform-node's source looking for the metadata symbol the consumer's deepkit transformer had emitted and failed.

We tried a partial fix (auto-inject `import '@mionjs/core/aot-caches'` into entries, externalize `@mionjs/*` by default) and discovered the deeper problem: `@mionjs/router` has its **own** module-level cache (`persistedMethods`) separate from `@mionjs/core`'s `methodsCache`. Populating core's globals from a virtual side-effect import did not populate router's persistedMethods, so route resolution failed at runtime with `AOTCacheError: Route/middleFn "mion@methodsMetadata" not found in AOT cache.`

Adding `import { loadCompiledMethods } from '@mionjs/router'` to the combined virtual module would have fixed the runtime error but would have pulled `@mionjs/router` into every **client** build (the virtual module is shared between client and server) — which the user correctly rejected.

The architectural research summary (Drizzle, Remix, SvelteKit, TanStack Router, Deepkit, Prisma, vike, NestJS, Astro, Nuxt) is unanimous: **no major OSS framework mutates internal state of an externalized runtime via virtual modules.** vike's #901 thread is the canonical "tried it, hit dual-instance bugs, told to bundle." The three patterns that scale are (a) bundle the framework, (b) constructor-arg passing, (c) call-site inlining.

Drizzle uses pattern (b) and is already in mion's stack. Mion's own [`@mionjs/drizze`](../packages/drizze/src/postgres.ts) integration package is already stateless. This refactor brings `@mionjs/router` and `@mionjs/client` into the same architectural bucket as drizzle.

---

## 2. Architecture

### Today (broken under externalization)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Consumer build (rollup)                                             │
│                                                                     │
│ apps/mionAppNode.ts                                                 │
│   import { initMionRouter } from '@mionjs/router'                   │
│   initMionRouter(routes, { aot: true })                             │
│                                                                     │
│ ├── @mionjs/router (must be bundled — its source is walked)         │
│ │   └── aotCacheLoader.ts                                           │
│ │       └── import { ... } from '@mionjs/core/aot-caches' ◄───┐    │
│ │                                                              │    │
│ │   ┌─ plugin's resolveShimModule intercepts ──────────────────┘    │
│ │   ▼                                                               │
│ │   virtual:mion-aot/caches  ← top-level side effects:              │
│ │     import { addAOTCaches, ... } from '@mionjs/core'              │
│ │     addAOTCaches(jit, pure)   // mutates core globals             │
│ │     addRoutesToCache(router)  // mutates core globals             │
│ │                                                                   │
│ ├── @mionjs/core (must be bundled — its globals get mutated)        │
│ ├── @mionjs/run-types (bundled by transitive)                       │
│ └── @mionjs/platform-node (also bundled — unwanted, breaks build)   │
└─────────────────────────────────────────────────────────────────────┘
```

### After (drizzle-style)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Consumer build (rollup)                                             │
│                                                                     │
│ apps/mionAppNode.ts                                                 │
│   import * as aotCaches from 'virtual:mion-aot/caches'              │
│   import { initMionRouter } from '@mionjs/router'                   │
│   initMionRouter(routes, { aotCaches })                             │
│   ├─ virtual:mion-aot/caches  ← pure data:                          │
│   │    export const jitFnsCache = {...}                             │
│   │    export const pureFnsCache = {...}                            │
│   │    export const routerCache = {...}                             │
│   │                                                                 │
│   ├─ @mionjs/router  ← EXTERNAL (require at runtime)                │
│   ├─ @mionjs/core    ← EXTERNAL (require at runtime)                │
│   └─ @mionjs/platform-node ← EXTERNAL (require at runtime)          │
└─────────────────────────────────────────────────────────────────────┘

At runtime: initMionRouter(routes, { aotCaches }) — runs INSIDE the
externalized @mionjs/router module instance — calls loadAOTCaches(aotCaches)
and loadCompiledMethods(aotCaches.routerCache) on its own state. Same JS
realm, no cross-module mutation, no external→internal state coupling.
```

The pivot: the data crosses the realm boundary as a **value passed into a function from the framework**, not via virtual module side effects mutating the framework. Same pattern drizzle uses for `drizzle(client, { schema })`.

---

## 3. Public API in 0.9

### `@mionjs/core`

`loadAOTCaches` is **redefined to take an argument** (decision per user note: "pass arguments to loadAOTCaches instead of loading side effects"):

```ts
// packages/core/src/aot/aotCaches.ts (new, replaces existing)
import { addAOTCaches, addRoutesToCache } from '../routerUtils.ts';

export interface AOTCaches {
    jitFnsCache: PersistedJitFunctionsCache;
    pureFnsCache: PersistedPureFunctionsCache;
    routerCache: MethodsCache;
}

/**
 * Loads AOT caches into @mionjs/core's global registry.
 * Call this once at app startup with caches imported from `virtual:mion-aot/caches`.
 *
 * Note: this populates the @mionjs/core caches only. If you're using @mionjs/router,
 * `initMionRouter({ aotCaches })` calls this internally AND populates router-side
 * persistedMethods via loadCompiledMethods. Use this function directly only when
 * using run-types standalone (no router, no client).
 */
export function loadAOTCaches(caches: AOTCaches): void {
    addAOTCaches(caches.jitFnsCache, caches.pureFnsCache);
    addRoutesToCache(caches.routerCache);
}
```

Also keep exposed (no signature change):
- `addAOTCaches(jitFnsCache, pureFnsCache)` — populates jit + pure caches.
- `addRoutesToCache(routerCache)` — populates `methodsCache`.

These three give standalone run-types users full manual control. `loadAOTCaches(caches)` is the convenient one-call wrapper.

`getRawAOTCaches` is **removed** (no longer needed — the caches are the user's data, not something to retrieve from a hidden store).

### `@mionjs/router`

`RouterOptions` gains `aotCaches`, **drops `aot`**:

```ts
// packages/router/src/types/general.ts — diff
export interface RouterOptions<Req = any, ContextData extends Record<string, any> = any> extends CoreRouterOptions {
    // ...existing fields...

-    /** Enable AOT (Ahead-of-Time) mode... */
-    aot?: boolean;

+    /**
+     * Pre-compiled AOT caches generated by mionVitePlugin.
+     * When provided, the router uses pre-compiled JIT functions and route metadata.
+     * Throws if any route/middleFn is missing from the cache (strict AOT mode).
+     * Import from `virtual:mion-aot/caches` in your entry file.
+     *
+     * @example
+     * import * as aotCaches from 'virtual:mion-aot/caches';
+     * await initMionRouter(routes, { aotCaches });
+     */
+    aotCaches?: AOTCaches;
}
```

`initMionRouter` loads the caches when the option is present:

```ts
// packages/router/src/router.ts — diff inside initMionRouter
export async function initMionRouter<R extends Routes>(
    routes: R,
    opts?: Partial<RouterOptions>
): Promise<PublicApi<R>> {
    await initRouter(opts);
    const publicApi = await registerRoutes(routes);
    await emitAOTCaches();
    return publicApi;
}

// packages/router/src/router.ts — diff inside initRouter
export async function initRouter(opts?: Partial<RouterOptions>): Promise<Readonly<RouterOptions>> {
    if (isRouterInitialized) throw new Error('Router has already been initialized');
    routerOptions = {...routerOptions, ...opts};
    validateSharedDataFactory(routerOptions);
    Object.freeze(routerOptions);
    setErrorOptions(routerOptions);
-    if (routerOptions.aot) await loadAOTCaches();
+    if (routerOptions.aotCaches) {
+        const { loadAOTCaches } = await import('@mionjs/core');
+        loadAOTCaches(routerOptions.aotCaches);
+        loadCompiledMethods(routerOptions.aotCaches.routerCache);
+    }
    isRouterInitialized = true;
    await registerRoutes({...mionErrorsRoutes});
    if (!routerOptions.skipClientRoutes) await registerRoutes({...mionClientRoutes});
    if (!isTestEnv()) console.log('mion router initialized', {routerOptions});
    return routerOptions;
}
```

Notes:
- The dynamic `await import('@mionjs/core')` mirrors the existing dynamic-import discipline ([router.ts:256](../packages/router/src/router.ts#L256)) so router source doesn't bundle core eagerly when consumers don't use AOT.
- `loadCompiledMethods` stays put in [`@mionjs/router/src/lib/methodsCache.ts:66`](../packages/router/src/lib/methodsCache.ts#L66) (decision per user note: "keep loadCompiledMethods, do not move anything"). It remains exported via the existing `export * from './src/lib/methodsCache.ts';` in [router/index.ts:24](../packages/router/index.ts#L24).

`getHandlerReflection` switches its AOT-mode error gate:

```ts
// packages/router/src/lib/reflection.ts — diff
async function getHandlerReflection(handler, routeId, routerOptions, handlerOptions = {}, isHeadersMiddleFn = false, methodStrictTypes) {
    const cached = methodsCache.getPersistedMethodMetadata(routeId);
    if (cached) return extractReflectionFromCached(cached);
-    if (routerOptions.aot) throw new AOTCacheError(routeId, isHeadersMiddleFn ? 'middleFn' : 'route');
+    if (routerOptions.aotCaches) throw new AOTCacheError(routeId, isHeadersMiddleFn ? 'middleFn' : 'route');
    // ...JIT compile fallback
}
```

`loadAOTCaches`/`loadRouterAOTCaches` private helpers in [router.ts:256](../packages/router/src/router.ts#L256) and [router/src/aot/aotCacheLoader.ts](../packages/router/src/aot/aotCacheLoader.ts) are **deleted**. The router no longer dynamically imports `./aot/aotCacheLoader.ts` — the load happens directly in `initRouter` from the option.

### `@mionjs/client`

`ClientOptions` gains `aotCaches`. `initClient` loads the caches:

```ts
// packages/client/src/types.ts — diff
export interface ClientOptions extends CoreRouterOptions {
    baseURL: string;
    basePath: string;
    suffix: string;
    autoGenerateErrorId: boolean;
    fetchOptions: RequestInit;
    validateParams: boolean;
    serializer: SerializerMode;
    timeout?: number;
+    /**
+     * Pre-compiled AOT caches generated by mionVitePlugin (client mode).
+     * Import from `virtual:mion-aot/caches` and pass to enable AOT.
+     */
+    aotCaches?: AOTCaches;
}
```

```ts
// packages/client/src/client.ts — diff
export function initClient<RM extends RemoteApi>(
    options: InitClientOptions
): {client: MionClient; routes: ClientRoutes<RM>; middleFns: ClientMiddleFns<RM>} {
    registerErrorDeserializers();
    const clientOptions = {
        ...DEFAULT_PREFILL_OPTIONS,
        ...options,
    };
+    if (clientOptions.aotCaches) {
+        const { loadAOTCaches } = await import('@mionjs/core');  // or sync import — see note
+        loadAOTCaches(clientOptions.aotCaches);
+    }
    const client = new MionClient(clientOptions);
    const rootProxy = new MethodProxy([], client, clientOptions);
    return {
        client,
        routes: rootProxy.proxy as ClientRoutes<RM>,
        middleFns: rootProxy.proxy as ClientMiddleFns<RM>,
    };
}
```

Note on sync vs async import in client: `initClient` is currently sync. Pulling `loadAOTCaches` via dynamic `import` would make it return a `Promise`. Two options:

- **(a)** Make `initClient` async (breaking, but minor). Consumers `await initClient(...)`.
- **(b)** Use a regular `import { loadAOTCaches } from '@mionjs/core';` at the top of `client.ts` — no laziness. Slightly larger bundle when consumers don't use AOT, but `loadAOTCaches` is tiny (3 function calls).

**Recommendation: (b)** — simpler, keeps `initClient` sync, the size cost is negligible.

Client doesn't need `loadCompiledMethods` (router-side concern only).

---

## 4. Cross-instance identity: `Symbol.for("mion:registry")`

Adopt drizzle's pattern (their fix for issue #283) so duplicate copies of `@mionjs/core` or `@mionjs/router` (npm hoisting, dual ESM/CJS, monorepo dedup quirks) share state via the `globalThis` symbol registry instead of having independent module instances.

```ts
// packages/core/src/jit/jitUtils.ts — diff sketch
const REGISTRY = Symbol.for('mion:registry:core');
type CoreRegistry = {
    jitFnsCache: PersistedJitFunctionsCache;
    pureFnsCache: PersistedPureFunctionsCache;
    deserializeFnsRegistry: Map<string, any>;
    serializableClassRegistry: Map<any, any>;
};
const registry = ((globalThis as any)[REGISTRY] ??= {
    jitFnsCache: {},
    pureFnsCache: {},
    deserializeFnsRegistry: new Map(),
    serializableClassRegistry: new Map(),
}) as CoreRegistry;

export const jitFnsCache = registry.jitFnsCache;
export const pureFnsCache = registry.pureFnsCache;
// ...
```

Same shape for:
- `@mionjs/core/src/routerUtils.ts` — `methodsCache`, `methodsOptionsCache`, `jitFunctionsCache`, `headerJitFunctionsCache` (under same `mion:registry:core` symbol — single registry per package).
- `@mionjs/core/src/pureFns/quickHash.ts` — `hashes`, `literalHashes`.
- `@mionjs/router/src/lib/methodsCache.ts` — `persistedMethods` (under separate `mion:registry:router` symbol — router can be loaded independently).
- `@mionjs/router/src/router.ts` — `routerOptions`, `isRouterInitialized`, `startMiddleFnsDef`, `endMiddleFnsDef`, `complexity` (same router registry).
- `@mionjs/router/src/callContext.ts` — `contextPool`.

Backward compatible at the API level: existing `export const jitFnsCache` still exists and points to the same object the registry holds. Just the storage moves.

**Why two registry symbols**: core can be used standalone (run-types only); router depends on core. Keeping them in separate symbol slots avoids `globalThis['mion:registry']` becoming an undisclosed coupling between packages.

---

## 5. Plugin changes (`@mionjs/devtools`)

### 5.1 Virtual module: pure data

[`packages/devtools/src/vite-plugin/aotCacheGenerator.ts`](../packages/devtools/src/vite-plugin/aotCacheGenerator.ts) — replace `generateCombinedCachesModule`:

```ts
/** Generates the combined virtual module — pure data, no side effects.
 *  Safe to share between client and server builds. */
export function generateCombinedCachesModule(): string {
    return `/* Auto-generated combined AOT caches - do not edit */
import { pureFnsCache } from 'virtual:mion-aot/pure-fns';
import { jitFnsCache } from 'virtual:mion-aot/jit-fns';
import { routerCache } from 'virtual:mion-aot/router-cache';

export { jitFnsCache, pureFnsCache, routerCache };
`;
}
```

No `addAOTCaches` call. No `addRoutesToCache` call. No `import { ... } from '@mionjs/core'`. No `loadCompiledMethods`. The previous `loadAOTCaches` and `getRawAOTCaches` exports also go away (callers will import `loadAOTCaches` from `@mionjs/core` directly if they want it).

The per-cache generators (`generateJitFnsModule`, `generatePureFnsModule`, `generateRouterCacheModule`) stay unchanged — they already emit pure data.

`generateNoopCombinedModule` (when AOT data isn't available) becomes:

```ts
export function generateNoopCombinedModule(): string {
    return `/* No-op AOT caches - AOT not yet generated */
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
`;
}
```

### 5.2 Externalization defaults: simplify

[`packages/devtools/src/vite-plugin/mionVitePlugin.ts`](../packages/devtools/src/vite-plugin/mionVitePlugin.ts) — revert and simplify the changes added in the `mion-run-types` branch:

#### Revert (already done in branch but undo before re-implementing)

- `entryPaths: Set<string>` field — **delete**.
- `collectEntryPaths` helper — **delete**.
- `configResolved` no longer collects entry paths.
- Entry-injection block in `transform`: `if (isEntry) code = \`import '${AOT_CACHES_SHIM}';\\n\` + code;` — **delete**. No auto-injection (decision per user note: "yes lets require an explicit import").
- `addSsrNoExternal(config, [/^@mionjs\//])` line for `serverConfig` — **delete**. The vite-node AOT child process loads the user's server which now does its own cache loading via `aotCaches`. No need to bundle @mionjs source through the plugin pipeline.
- `addSsrNoExternal` signature can stay `(string | RegExp)[]` (harmless); or revert to `string[]` if we want to keep the change minimal.

#### New defaults

```ts
function wrapBuildExternal(config: Record<string, any>, shimModules: string[]): void {
    if (!config.build) config.build = {};
    if (!config.build.rollupOptions) config.build.rollupOptions = {};
    const original = config.build.rollupOptions.external;
    config.build.rollupOptions.external = (id: string, ...rest: any[]) => {
        // Plugin-controlled IDs: bundled (plugin's load hook supplies content)
        if (shimModules.includes(id) || id.startsWith('virtual:mion')) return false;
        // Delegate to original
        if (typeof original === 'function') {
            const r = original(id, ...rest);
            if (r !== undefined) return r;
        } else if (Array.isArray(original)) {
            return original.some((ext) => (ext instanceof RegExp ? ext.test(id) : ext === id));
        } else if (original instanceof RegExp) {
            return original.test(id);
        } else if (typeof original === 'string') {
            return original === id;
        }
        // Default (no original): externalize bare specifiers — Vite lib-mode default.
        // This naturally externalizes @mionjs/* including platform-*, since the only
        // @mionjs ids we want to bundle are the shim ids handled above.
        return /^[^./]/.test(id);
    };
}
```

`shimModules` still contains `SERVER_PURE_FNS_SHIM` and `AOT_CACHES_SHIM` for backward-compat with users who may still import these paths in 0.8.x style. In 0.9 the public docs only show the `virtual:mion-aot/caches` import; the shim paths can be deprecated and emit a console warning the first time they're resolved.

### 5.3 Resolve hook: keep shim resolution for backward compat

`resolveShimModule` ([mionVitePlugin.ts:643](../packages/devtools/src/vite-plugin/mionVitePlugin.ts#L643)) is no longer needed for AOT data flow but **keep it** for one cycle as a deprecation aid: when `@mionjs/core/aot-caches` is imported, log:

```
[mion] @mionjs/core/aot-caches is deprecated. Import from 'virtual:mion-aot/caches' and pass to initMionRouter / initClient via the `aotCaches` option. See migration guide.
```

…and continue to resolve to the virtual cache module so existing 0.8 code keeps working until removal in 0.10 or 1.0.

### 5.4 SSR / dev mode

`configureServer` ([mionVitePlugin.ts:231](../packages/devtools/src/vite-plugin/mionVitePlugin.ts#L231)) doesn't change shape, but the AOT child process runs the user's start script — which in 0.9 calls `initMionRouter({ aotCaches })` itself with imported data. That still works in vite-node SSR because the virtual module is generated by the plugin and `ssrLoadModule` walks the user's entry. No `noExternal: [/@mionjs\//]` needed.

### 5.5 Virtual module type definitions

[`packages/devtools/src/vite-plugin/virtual-modules.d.ts`](../packages/devtools/src/vite-plugin/virtual-modules.d.ts) — type the exports so consumers get autocomplete on `import * as aotCaches`:

```ts
declare module 'virtual:mion-aot/caches' {
    import type { AOTCaches } from '@mionjs/core';
    export const jitFnsCache: AOTCaches['jitFnsCache'];
    export const pureFnsCache: AOTCaches['pureFnsCache'];
    export const routerCache: AOTCaches['routerCache'];
}

declare module 'virtual:mion-aot/jit-fns' {
    import type { AOTCaches } from '@mionjs/core';
    export const jitFnsCache: AOTCaches['jitFnsCache'];
}
declare module 'virtual:mion-aot/pure-fns' {
    import type { AOTCaches } from '@mionjs/core';
    export const pureFnsCache: AOTCaches['pureFnsCache'];
}
declare module 'virtual:mion-aot/router-cache' {
    import type { AOTCaches } from '@mionjs/core';
    export const routerCache: AOTCaches['routerCache'];
}
```

The `AOTCaches` interface is the new export from `@mionjs/core` (see §3).

---

## 6. Per-package implementation checklist

### `@mionjs/core`

- [ ] Add `AOTCaches` interface and updated `loadAOTCaches(caches: AOTCaches)` to [`src/aot/aotCaches.ts`](../packages/core/src/aot/aotCaches.ts).
- [ ] Re-export `AOTCaches` and `loadAOTCaches` from [`packages/core/index.ts`](../packages/core/index.ts).
- [ ] Delete [`src/aot/emptyCaches.ts`](../packages/core/src/aot/emptyCaches.ts) (no longer imported by anyone after migration).
- [ ] Delete [`src/aot/serverPureFnsCaches.ts`](../packages/core/src/aot/serverPureFnsCaches.ts) and [`src/aot/emptyServerPureFns.ts`](../packages/core/src/aot/emptyServerPureFns.ts) **only if** the `SERVER_PURE_FNS_SHIM` mechanism is also being removed; otherwise keep.
- [ ] Wrap `jitFnsCache`, `pureFnsCache`, `deserializeFnsRegistry`, `serializableClassRegistry` in `Symbol.for('mion:registry:core')` in [`src/jit/jitUtils.ts`](../packages/core/src/jit/jitUtils.ts).
- [ ] Wrap `methodsCache`, `methodsOptionsCache`, `jitFunctionsCache`, `headerJitFunctionsCache` in same symbol registry, in [`src/routerUtils.ts`](../packages/core/src/routerUtils.ts).
- [ ] Wrap `hashes`, `literalHashes` in same symbol registry, in [`src/pureFns/quickHash.ts`](../packages/core/src/pureFns/quickHash.ts).
- [ ] Update unit tests under `packages/core/**/*.spec.ts` that asserted module-level state isolation; expect cross-test pollution risk and add `beforeEach(resetJitFnCaches)` where missing.

### `@mionjs/router`

- [ ] Add `aotCaches?: AOTCaches` field to `RouterOptions` in [`src/types/general.ts:28`](../packages/router/src/types/general.ts#L28).
- [ ] **Remove** `aot?: boolean` field from same interface (lines 58-65).
- [ ] In [`src/router.ts`](../packages/router/src/router.ts) `initRouter`, replace `if (routerOptions.aot) await loadAOTCaches();` with the explicit cache-loading block (see §3).
- [ ] Delete the private `loadAOTCaches()` helper in [`router.ts:256-259`](../packages/router/src/router.ts#L256-L259).
- [ ] Delete [`src/aot/aotCacheLoader.ts`](../packages/router/src/aot/aotCacheLoader.ts) entirely.
- [ ] In [`src/lib/reflection.ts`](../packages/router/src/lib/reflection.ts), change the AOT-error gate to `routerOptions.aotCaches` (search for the existing `routerOptions.aot` ref).
- [ ] Wrap `persistedMethods` in [`src/lib/methodsCache.ts:13`](../packages/router/src/lib/methodsCache.ts#L13) under `Symbol.for('mion:registry:router')`.
- [ ] Wrap `routerOptions`, `isRouterInitialized`, `startMiddleFnsDef`, `endMiddleFnsDef`, `complexity` in same registry, in [`src/router.ts`](../packages/router/src/router.ts) (top-level `let` bindings).
- [ ] Wrap `contextPool` in same registry, in [`src/callContext.ts`](../packages/router/src/callContext.ts).
- [ ] Update unit tests under `packages/router/**/*.spec.ts` for the API change.
- [ ] Search for `routerOptions.aot` and `loadAOTCaches` references across `packages/router/src` — every hit becomes `routerOptions.aotCaches` or is deleted.

### `@mionjs/client`

- [ ] Add `aotCaches?: AOTCaches` field to `ClientOptions` in [`src/types.ts:54`](../packages/client/src/types.ts#L54).
- [ ] Add the AOT cache loader call in [`src/client.ts:32`](../packages/client/src/client.ts#L32) `initClient` (sync `import { loadAOTCaches } from '@mionjs/core'` per §3 recommendation).
- [ ] Update unit tests / e2e tests in [`src/aotSSR.e2e.test.ts`](../packages/client/src/aotSSR.e2e.test.ts) for the new pattern.

### `@mionjs/devtools`

- [ ] Rewrite `generateCombinedCachesModule` and `generateNoopCombinedModule` in [`src/vite-plugin/aotCacheGenerator.ts`](../packages/devtools/src/vite-plugin/aotCacheGenerator.ts) per §5.1.
- [ ] In [`src/vite-plugin/mionVitePlugin.ts`](../packages/devtools/src/vite-plugin/mionVitePlugin.ts):
  - [ ] Delete `entryPaths`, `collectEntryPaths` and the entry-injection block in `transform` (revert this branch's additions).
  - [ ] Delete `if (serverConfig) addSsrNoExternal(config, [/^@mionjs\//]);` (revert this branch's addition).
  - [ ] Keep simplified `wrapBuildExternal` per §5.2.
  - [ ] Keep `addSsrNoExternal` accepting `RegExp` (harmless future-proofing).
  - [ ] Keep `resolveShimModule` for `AOT_CACHES_SHIM` for one deprecation cycle; emit warning on first resolve.
- [ ] Update [`src/vite-plugin/virtual-modules.d.ts`](../packages/devtools/src/vite-plugin/virtual-modules.d.ts) per §5.5.
- [ ] Update tests in [`src/vite-plugin/mionVitePlugin.spec.ts`](../packages/devtools/src/vite-plugin/mionVitePlugin.spec.ts):
  - Assertions for entry-injection — **delete**.
  - Assertions for `noExternal` containing `/^@mionjs\//` — **delete**.
  - Update "default external" tests: `@mionjs/platform-node`, `@mionjs/router`, `@mionjs/core` all return `true` (external) by default; `virtual:mion*` and shim ids return `false`.
  - Add a new test asserting `generateCombinedCachesModule()` output contains no `addAOTCaches` / `loadCompiledMethods` / `import { ... } from '@mionjs/core'` lines.
- [ ] Add a smoke test that imports the generated combined module against a fake virtual cache fixture and verifies the named exports work.

### `@mionjs/run-types`, `@mionjs/type-formats`

- [ ] No code changes.
- [ ] Add a usage example in their READMEs showing `loadAOTCaches(aotCaches)` for standalone use.

### `@mionjs/platform-*` (all 6: node, bun, aws, gcloud, vercel, cloudflare)

- [ ] Zero changes.
- [ ] Confirm each `vite.config.ts` is unchanged after rebase.

### `@mionjs/test-server`

- [ ] Update [`src/`](../packages/test-server/src/) entry — switch `aot: true` → `aotCaches`-based flow.
- [ ] Rebuild outputs in [`build/`](../packages/test-server/build/) by running its build script. (Not manually edited.)

### `@mionjs/examples`

- [ ] Update every example under [`packages/examples/`](../packages/examples/) that demonstrates AOT.

### `@mionjs/drizze`

- [ ] No code changes (already stateless and follows the target pattern).
- [ ] Optionally add a README note that this package is the architectural model for the new mion AOT pattern.

---

## 7. Documentation sweep

Every doc that mentions `aot: true`, `loadAOTCaches()`, `loadRouterAOTCaches()`, the `@mionjs/core/aot-caches` shim path, or the consumer `vite.config` `noExternal` config needs updating.

Mechanical steps:

```bash
# Sanity grep — all of these should be reduced or removed
git grep -nE 'aot:\s*true' packages/ website/ examples/ docs/ README.md
git grep -nE 'loadAOTCaches\(\)' packages/ website/ examples/ docs/ README.md
git grep -nE 'loadRouterAOTCaches' packages/ website/ examples/ docs/ README.md
git grep -nE '@mionjs/core/aot-caches' packages/ website/ examples/ docs/ README.md
git grep -nE 'noExternal.*@mionjs' packages/ website/ examples/ docs/ README.md
```

Files almost certainly affected:

- [`README.md`](../README.md)
- [`CLAUDE.md`](../CLAUDE.md) — add a note under architecture about the AOT cache pattern.
- [`packages/core/README.md`](../packages/core/README.md) — add `loadAOTCaches(aotCaches)` standalone example.
- [`packages/router/README.md`](../packages/router/README.md) — show `initMionRouter(routes, { aotCaches })`.
- [`packages/client/README.md`](../packages/client/README.md) — show `initClient({ baseURL, aotCaches })`.
- [`packages/devtools/README.md`](../packages/devtools/README.md) — minimal vite.config example with just `mionVitePlugin(...)`; remove `noExternal` and `external` snippets.
- [`packages/run-types/README.md`](../packages/run-types/README.md) — standalone usage with `loadAOTCaches`.
- [`website/`](../website/) — entire content tree under Nuxt 4 / Docus v5. Likely many MDC files. Sweep search-and-replace; verify code-import components still resolve.

Add a new top-level page:

- `website/content/docs/migration/0.9.md` — migration guide (template in §9 below).

Existing planning notes worth checking for stale references:

- [`plans/02-aot-caches-client-override.md`](./02-aot-caches-client-override.md) — likely related; review and either fold into 0.9 or mark superseded.
- [`plans/01-hardcode-client-virtual-module.md`](./01-hardcode-client-virtual-module.md) — review.

---

## 8. External consumer (`mion-benchmarks`)

The benchmarks repo is the reference real-world consumer. Update post-publish:

- [ ] [`apps/src/mionAppNode.ts`](/Users/majerez/Projects/mion-benchmarks/apps/src/mionAppNode.ts) — switch to `import * as aotCaches from 'virtual:mion-aot/caches'` + `initMionRouter(routes, { aotCaches })`.
- [ ] [`apps/src/mionAppBun.ts`](/Users/majerez/Projects/mion-benchmarks/apps/src/mionAppBun.ts) — same.
- [ ] [`vite.config.mts`](/Users/majerez/Projects/mion-benchmarks/vite.config.mts) — already pruned of `ssr.noExternal` and `rollupOptions.external` in the `mion-run-types` branch's verification step; confirm still empty.
- [ ] Run `npm run build` and `npm run test-servers` — this is the canonical regression test that exercises the full path including the bug surfaced by this work (`AOTCacheError: ... mion@methodsMetadata not found`). After the refactor it MUST pass.

---

## 9. User migration guide (draft for `website/content/docs/migration/0.9.md`)

```markdown
# Migrating to mion 0.9

mion 0.9 changes how AOT caches reach the runtime. Caches are now **explicit
values** you import and pass to `initMionRouter` / `initClient`, instead of
side-effect imports that mutated framework internals. This matches Drizzle's
pattern (which mion's ORM integration already follows) and lets every
`@mionjs/*` package be `external` in your build.

## What changed

| Before (0.8) | After (0.9) |
|---|---|
| `initMionRouter(routes, { aot: true })` | `initMionRouter(routes, { aotCaches })` (with explicit import) |
| `aot: true` flag | removed — presence of `aotCaches` is the AOT signal |
| `import '@mionjs/core/aot-caches'` (auto-injected or from router) | `import * as aotCaches from 'virtual:mion-aot/caches'` (explicit, you write it) |
| Consumer `vite.config` had `ssr.noExternal: [/@mionjs\//]` and `rollupOptions.external: ...` | Drop both. The plugin handles defaults. |
| `loadRouterAOTCaches()` | gone — `initMionRouter` does it via the option |
| `loadAOTCaches()` (no args) | `loadAOTCaches(caches)` (takes the data) |

## Migration steps

1. **Update entry files** to import the virtual module and pass it:

   ```diff
   + import * as aotCaches from 'virtual:mion-aot/caches';
     import { initMionRouter } from '@mionjs/router';

   - await initMionRouter(routes, { aot: true });
   + await initMionRouter(routes, { aotCaches });
   ```

2. **Update client init** if you use the mion client:

   ```diff
   + import * as aotCaches from 'virtual:mion-aot/caches';
     import { initClient } from '@mionjs/client';

   - const { client } = initClient<MyApi>({ baseURL });
   + const { client } = initClient<MyApi>({ baseURL, aotCaches });
   ```

3. **Simplify `vite.config`** — remove any `ssr.noExternal` for `@mionjs/*` and
   any custom `rollupOptions.external` carve-outs:

   ```diff
     export default defineConfig({
   -   ssr: { noExternal: [/@mionjs\//] },
       plugins: [ mionVitePlugin({ ... }) ],
       build: {
         lib: { entry, formats: ['cjs'] },
         rollupOptions: {
           output: { ... },
   -       external: (id) => {
   -         if (id.startsWith('virtual:')) return false;
   -         if (id.startsWith('@mionjs/')) return false;
   -         return /^[^./]/.test(id);
   -       },
         },
       },
     });
   ```

4. **Standalone `@mionjs/run-types`** users (no router, no client) call the
   loader directly:

   ```ts
   import * as aotCaches from 'virtual:mion-aot/caches';
   import { loadAOTCaches } from '@mionjs/core';

   loadAOTCaches(aotCaches);
   ```

## Multiple instances

Drizzle's `Symbol.for` registry lets you run multiple routers in one process:

```ts
import * as aotCachesA from 'virtual:mion-aot/caches';
import * as aotCachesB from 'virtual:mion-aot/caches?app=b';
// ...
```

(Configure the second cache via the plugin's `customVirtualModuleId` option.)
```

---

## 10. Versioning, tagging, release plan

- Version: **0.9.0**.
- Branch: `0.9-aot-refactor` (cut from `master` after 0.8.x line is stable).
- Pre-release: `0.9.0-alpha.1` to npm under `next` tag for early adopters; gather feedback for one cycle.
- Release: full `0.9.0` once docs / examples / website / mion-benchmarks all green.
- Breaking-change banner in CHANGELOG and GitHub release notes pointing to migration guide.
- Communicate on mion social channels / discord / discussions.

Compatibility shims to ship:
- `@mionjs/core/aot-caches` shim path: emit deprecation warning on first import; redirect to `virtual:mion-aot/caches`. Remove in 0.10.
- `loadAOTCaches()` (no-args overload): TypeScript-level removal in 0.9 (no overload kept). At runtime, calling without args throws a helpful "AOT API changed in 0.9, see migration guide" error.

---

## 11. Verification checklist

Before tagging 0.9.0:

- [ ] **All package tests green**: `npm run test` from mion root.
- [ ] **Pre-publish gate**: `bash scripts/pre-publish-test.sh`.
- [ ] **Type checking**: `npm run lint` (or `tsc --noEmit` per package) reports no `aot: true` / `loadAOTCaches()` / deleted-symbol references.
- [ ] **Backward-removal grep**: `git grep -nE 'routerOptions\.aot[^C]|loadRouterAOTCaches|@mionjs/router/src/aot/aotCacheLoader' packages/ website/` returns zero hits.
- [ ] **External-consumer build (mion-benchmarks)**: `npm run mionlink && npm run build` succeeds with no `noExternal` / no `rollupOptions.external` overrides in `vite.config.mts`.
- [ ] **External-consumer runtime (mion-benchmarks)**: `npm run test-servers` passes for both Node and Bun servers — `/hello` returns 200, `/updateUser` validates correctly. Specifically: the previously-failing `AOTCacheError: ... mion@methodsMetadata not found` does NOT recur.
- [ ] **Bundle inspection**: `_compiled-apps/apps/src/mionAppNode.js` shows `@mionjs/router`, `@mionjs/core`, `@mionjs/platform-node` as runtime `require()` calls (external). The AOT data is exposed via the virtual module, with `initMionRouter(routes, { aotCaches })` as the consumer entry's call.
- [ ] **Bundle size**: compare `_compiled-apps/apps/src/mionAppNode.js` size 0.8 vs 0.9 — expect a meaningful reduction (router + core no longer inlined).
- [ ] **Multi-instance test (new)**: spin up two `initMionRouter` calls in one Node process with two different `aotCaches` objects; verify both register routes and respond correctly.
- [ ] **Symbol.for registry test (new)**: simulate two copies of `@mionjs/core` in different `node_modules` subtrees; verify `globalThis[Symbol.for('mion:registry:core')]` is shared and caches survive the duplication.
- [ ] **Devtools tests**: `npx vitest run --project devtools` — virtual module assertions verify pure-data shape; externalization tests verify default external for `@mionjs/*`.
- [ ] **Website builds** (`./website`): no broken code-import references to deleted files / paths.
- [ ] **Migration guide (`docs/migration/0.9.md`)** reviewed by user, links from CHANGELOG and 0.9 release notes.

---

## 12. Known unknowns / things to revisit during implementation

1. **`Symbol.for` namespace collision**: the `mion:registry:core` and `mion:registry:router` keys must be stable forever. If a future breaking change needs to invalidate, bump the key (e.g. `mion:registry:core:v2`). Document this contract in [`packages/core/README.md`](../packages/core/README.md).

2. **Vite-node SSR mode**: the `configureServer` middleware path uses `ssrLoadModule('@mionjs/router')` and `ssrLoadModule('@mionjs/platform-node')` ([`mionVitePlugin.ts:255-258`](../packages/devtools/src/vite-plugin/mionVitePlugin.ts#L255-L258)). After dropping `noExternal: [/@mionjs\//]`, confirm these still resolve correctly in dev mode — Vite's SSR resolver may need an explicit hint or these calls may need to switch to `import()`. Worth a dedicated test.

3. **Dual-package hazard for the registry**: `globalThis` is shared across CJS and ESM, so the `Symbol.for` registry naturally bridges them. But if a consumer somehow ends up with both a CJS and ESM copy of `@mionjs/core` *with the same `mion:registry:core` symbol pointing to different prototypes*, equality-by-reference assumptions might still trip. Keep a low-priority issue open to revisit if reports surface.

4. **`aotCaches` shape variation between server and client**: today the same virtual module is generated for both. If client builds eventually need a strict subset (no `routerCache`, just `jitFnsCache` and `pureFnsCache`), we may want `client-aot-caches` as a separate virtual module. For 0.9, keep it unified — the server fields just go unused on the client side, no real cost.

5. **AOT child-process generation flow**: today the AOT child loads the user's start script via vite-node, which previously needed `@mionjs/*` non-external. After dropping that, verify the AOT generation step itself still works — the user's `mionAotStart.ts` would now look like:

   ```ts
   import { initMionRouter } from '@mionjs/router';
   import { routes } from './mionRoutes';
   await initMionRouter(routes, { strictTypes: true });  // no aotCaches — this RUN generates them
   ```

   The AOT child then harvests `jitFnsCache`, `pureFnsCache`, `routerCache` from the live router/core globals (or from the new instance's state if we ever go fully instance-scoped). Confirm the harvesting code path still finds the data.

6. **Optional follow-up**: a future 0.10 could go fully instance-scoped (no globals at all, every cache lives on the router/client instance returned by init). 0.9 keeps globals and just makes the AOT *entry* explicit; this is the smaller-blast-radius change. Note this in the 1.0 roadmap.

---

## 13. Out of scope for this plan (deliberately)

- Client-side AOT diff between SSR and CSR builds — covered separately by [`plans/02-aot-caches-client-override.md`](./02-aot-caches-client-override.md).
- Hard-coded client virtual module — see [`plans/01-hardcode-client-virtual-module.md`](./01-hardcode-client-virtual-module.md).
- Mion CLI rewrite, devtools websocket dashboard, codegen package — unrelated.
- Removing the auto-build chain (`scripts/pre-publish-test.sh`) for AOT-data freshness — out of scope.

---

## Appendix A — Decisions made (for future-you reading this in a month)

1. **Keep `loadCompiledMethods` in `@mionjs/router`**, do not relocate to core. (Decision per user note: "keep loadCompiledMethods, do not move anything".)
2. **`loadAOTCaches` takes the cache data as an argument** — not zero-args + side-effect imports. (Decision per user note: "pass arguments to loadAOTCaches instead of loading side effects".)
3. **Explicit import** in user code — no plugin auto-injection of `import * as aotCaches`. (Decision per user note: "yes lets require an explicit import".)
4. **Drop `aot: true` flag** entirely — `aotCaches` presence implies AOT mode. (Decision per user note: "I'm not sure we will need the AOT flag anymore".)
5. **Symbol.for registry pattern** for cross-instance state — drizzle's #283 fix.
6. **0.9.0** is breaking; 0.8.x stays on the old pattern with a 0.10 deprecation removal of `@mionjs/core/aot-caches` shim path.

## Appendix B — Why we ruled out alternatives

| Alternative | Why not |
|---|---|
| Selective bundling (bundle stateful pkgs, externalize platform-*) | Solves the immediate error but keeps the architectural debt — virtual-module-side-effects-into-mutable-globals has no good prior art and breaks under multi-instance. Also makes future external-router optimization impossible. |
| Move `persistedMethods` into `@mionjs/core` | Architectural muddle — router state has nothing to do with run-types. User explicitly said "keep loadCompiledMethods, do not move anything." |
| Add `loadCompiledMethods` to the combined virtual module | Pulls `@mionjs/router` into client builds. Rejected by user. |
| Auto-inject `import * as aotCaches from 'virtual:mion-aot/caches'` | Magic; conflicts with drizzle's explicit-import convention. Rejected by user. |
| Keep `aot: true` flag for backward compat | Adds a redundant signal — just check `aotCaches` presence. Drizzle has no such flag. Rejected by user. |
| globalThis registry as primary build→runtime channel | Pattern is debugging/cross-realm only in real OSS (React DevTools, TanStack Query DevTools, Module Federation). Not for production state hydration. The drizzle pattern (constructor arg + Symbol.for for identity) is what scales. |
