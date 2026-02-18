# Plan: Migrate AOT Codegen into mionVitePlugin Virtual Modules

## Goal

Replace the standalone `@mionkit/aot-caches` package and `mion-build-aot` CLI with virtual modules served by [`mionVitePlugin()`](packages/devtools/src/vite-plugin/mionPlugin.ts:121). The plugin will:

1. Start the user's server script in the same process to populate JIT caches
2. Generate virtual modules for `jitFnsCache`, `pureFnsCache`, and `routerCache`
3. Core imports from `@mionkit/aot-caches` will be replaced with virtual module imports

## Current Architecture

```mermaid
flowchart TD
    A[mion-build-aot CLI] -->|runs server script| B[Server populates JIT caches]
    B -->|getJitFnCaches + getPersistedMethods| C[cacheCompiler.ts]
    C -->|writes .js files| D[@mionkit/aot-caches build/]
    E[@mionkit/core jitUtils.ts] -->|import from| D
    F[@mionkit/core routerUtils.ts] -->|import from| D
```

### Key files involved:

- [`aot-compile.ts`](packages/devtools/src/codegen/aot-compile.ts) — runs server, collects caches, writes to files
- [`cacheCompiler.ts`](packages/devtools/src/codegen/cacheCompiler.ts) — serializes caches to JS code using `runType().createJitFunction(JitFunctions.toJSCode)`
- [`jitUtils.ts`](packages/core/src/jit/jitUtils.ts:23) — imports `jitFnsCache` and `pureFnsCache` from `@mionkit/aot-caches`
- [`routerUtils.ts`](packages/core/src/routerUtils.ts:9) — imports `routerCache` from `@mionkit/aot-caches`
- [`mionPlugin.ts`](packages/devtools/src/vite-plugin/mionPlugin.ts) — current vite plugin (pure functions + deepkit only)

## Proposed Architecture

```mermaid
flowchart TD
    A[mionVitePlugin configResolved hook] -->|spawns/imports server script| B[Server populates JIT caches in same process]
    B -->|getJitFnCaches + getPersistedMethods| C[Cache serialization - reuse cacheCompiler logic]
    C -->|virtual:mion-jit-cache| D[Virtual Module: jitFnsCache]
    C -->|virtual:mion-pure-cache| E[Virtual Module: pureFnsCache]
    C -->|virtual:mion-router-cache| F[Virtual Module: routerCache]
    C -->|virtual:mion-pure-functions| G[Virtual Module: pureFns - existing]
    H[@mionkit/core jitUtils.ts] -->|import from virtual module| D
    H -->|import from virtual module| E
    I[@mionkit/core routerUtils.ts] -->|import from virtual module| F
```

## Feasibility Analysis

### ✅ This is feasible because:

1. **Vite virtual modules are well-supported** — The plugin already uses virtual modules for pure functions. Adding more virtual module IDs is straightforward.

2. **Cache serialization already exists** — [`compileTypeToJs()`](packages/devtools/src/codegen/cacheCompiler.ts:99) already generates JS code from cache objects. We just need to return it as a string instead of writing to disk.

3. **Server startup logic exists** — [`compileAOT()`](packages/devtools/src/codegen/aot-compile.ts:97) already handles importing the server script and awaiting promises. We can reuse this pattern.

4. **Same process access** — Since Vite plugins run in the same Node.js process, after importing the server script, we can call [`getJitFnCaches()`](packages/core/src/jit/jitUtils.ts:236) and [`getPersistedMethods()`](packages/router/src/lib/reflection-aot.spec.ts) directly to access populated caches.

### ⚠️ Key challenges:

1. **Timing**: The server must be fully initialized BEFORE Vite resolves the virtual modules. We need to use `configResolved` or `buildStart` hook to run the server, and the `load` hook must wait for it.

2. **Error resilience**: If the server script fails, Vite should not crash. The virtual modules should return empty caches as fallback (same as current aot-caches template defaults).

3. **Import replacement**: `@mionkit/core` currently has hardcoded `import ... from '@mionkit/aot-caches'`. These need to be replaced with virtual module imports. The vite plugin can use `resolveId` to alias `@mionkit/aot-caches` to virtual modules.

4. **Compile tracking**: The [`enableCompileTracking()`](packages/devtools/src/codegen/aot-compile.ts:181) wrapping of jitUtils is needed to track which cache entries are actually used. This must happen before the server runs.

5. **`toJSCode` JIT function**: The [`compileTypeToJs()`](packages/devtools/src/codegen/cacheCompiler.ts:99) function uses `runType().createJitFunction(JitFunctions.toJSCode)` to serialize caches. This requires deepkit reflection to be available in the vite plugin process.

## Implementation Steps

### Phase 1: Extend mionVitePlugin with AOT options

**File: [`types.ts`](packages/devtools/src/vite-plugin/types.ts)**

- Add `AOTOptions` interface with `startServerScript: string` field
- Add `aot?: AOTOptions` to `MionPluginOptions`

**File: [`constants.ts`](packages/devtools/src/vite-plugin/constants.ts)**

- Add virtual module IDs:
  - `virtual:mion-jit-cache`
  - `virtual:mion-pure-cache`
  - `virtual:mion-router-cache`

### Phase 2: Server startup in vite plugin

**New file: `packages/devtools/src/vite-plugin/aotServer.ts`**

- Reuse logic from [`aot-compile.ts`](packages/devtools/src/codegen/aot-compile.ts:97):
  - `enableCompileTracking()` to wrap jitUtils
  - Set `process.env.MION_COMPILE = 'true'`
  - Dynamic import of the server script
  - Await any exported promises
- After server init, call `getJitFnCaches()` and `getPersistedMethods()`
- Serialize caches using `compileTypeToJs()` (reuse from cacheCompiler)
- Store serialized strings for virtual module responses
- Wrap everything in try/catch — on failure, log warning and return empty caches

### Phase 3: Virtual module generation for AOT caches

**File: [`mionPlugin.ts`](packages/devtools/src/vite-plugin/mionPlugin.ts)**

- In `configResolved` or `buildStart` hook: run the server and populate cache strings
- In `resolveId`: handle new virtual module IDs
- In `load`: return serialized cache code for each virtual module
- **Key**: Also resolve `@mionkit/aot-caches` to a virtual module that re-exports from the individual cache virtual modules (backward compatibility during migration)

### Phase 4: Update @mionkit/core imports

**File: [`jitUtils.ts`](packages/core/src/jit/jitUtils.ts:23)**

- Change `import {jitFnsCache, pureFnsCache} from '@mionkit/aot-caches'` to import from virtual modules
- OR: Keep the import as-is and have the vite plugin alias `@mionkit/aot-caches` → virtual module (simpler approach)

**File: [`routerUtils.ts`](packages/core/src/routerUtils.ts:9)**

- Same approach as jitUtils.ts

**Recommended approach**: Use `resolveId` in the vite plugin to intercept `@mionkit/aot-caches` and resolve it to a virtual module. This means **zero changes to core source code** — the plugin transparently replaces the import.

### Phase 5: Make restoreCaches public

**File: [`jitUtils.ts`](packages/core/src/jit/jitUtils.ts:187)**

- Export [`restoreCaches()`](packages/core/src/jit/jitUtils.ts:187) as a public function
- The virtual module code can call `restoreCaches()` to load the caches at runtime

### Phase 6: Remove aot-caches package and codegen CLI

- Remove `packages/aot-caches/` directory
- Remove codegen CLI files: `cli-build-aot.ts`, `cli-init-aot.ts`, `run-build-aot.ts`, `run-init-aot.ts`
- Remove `mion-aot-template/` directory
- Update `package.json` workspace references
- Remove bin entries from devtools package.json

### Phase 7: Update all package vite configs

- All packages currently using `deepkitType()` from `@deepkit/vite` should switch to `mionVitePlugin()`
- Packages that need AOT caches (core, router, client) add the `aot.startServerScript` option

## Virtual Module Output Format

The virtual module for `@mionkit/aot-caches` (or individual cache modules) would generate code like:

```js
// virtual:mion-jit-cache
export const jitFnsCache = {
  /* serialized by toJSCode */
};

// virtual:mion-pure-cache
export const pureFnsCache = {
  /* serialized by toJSCode */
};

// virtual:mion-router-cache
export const routerCache = {
  /* serialized by toJSCode */
};
```

When the server fails to start or AOT is not configured:

```js
// Fallback empty caches
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
```

## Plugin Configuration Example

```ts
// vite.config.ts (server package)
import {mionVitePlugin} from '@mionkit/devtools/vite-plugin';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      deepkitType: {
        tsConfig: './tsconfig.json',
      },
      pureFunctions: {
        clientSrcPath: '../client/src',
      },
      aot: {
        startServerScript: './src/init.ts',
      },
    }),
  ],
});
```

## Risk Mitigation

| Risk                                                                    | Mitigation                                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Server script fails during vite build                                   | Catch errors, log warning, return empty caches. Vite build continues.                                                             |
| Circular dependency: vite plugin needs core, core needs virtual modules | The plugin runs the server first, then generates virtual modules. The `resolveId` aliasing breaks the circular dep at build time. |
| `toJSCode` requires deepkit reflection                                  | The vite plugin already includes deepkit type transformation. Ensure the serialization runs after deepkit is available.           |
| HMR invalidation                                                        | For dev mode, re-run server on file changes and invalidate virtual modules (similar to current pure functions HMR).               |
| Same process pollution                                                  | The server runs in the same process as vite. Need to ensure `MION_COMPILE=true` and cleanup after cache collection.               |

## Open Questions

1. **Dev mode**: Should the server be re-started on every file change, or only on explicit rebuild? Re-starting on every change could be slow.
2. **Build order**: When building the monorepo, core needs to be built before the server. But the server needs to run to generate caches for core. The `resolveId` aliasing approach solves this — core source code doesn't change, only the vite build resolves differently.
