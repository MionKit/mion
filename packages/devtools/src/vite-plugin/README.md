# Mion Vite Plugin

The mion Vite plugin (`mionVitePlugin`) is a unified plugin that handles three core features:

1. **Pure Server Functions** - Extract, validate, and inject pure functions from client source
2. **RunTypes (Deepkit)** - TypeScript type reflection via deepkit compiler transformers
3. **AOT Caches** - Ahead-of-time compilation of JIT type functions and route metadata

```ts
mionVitePlugin({
  runTypes: {include: ['**/*.ts']},
  server: {
    startServerScript: './src/init.ts',
    mode: 'onlyAOT',
  },
});
```

---

## Plugin Lifecycle

```
1. config()           → Strip reflection module aliases if excludeReflection enabled
2. configResolved()   → Resolve cache directory, detect SSR mode
3. buildStart()       → Generate AOT caches (onlyAOT/IPC mode)
   configureServer()  → Generate AOT caches (viteSSR mode), set up dev proxy middleware
4. resolveId()        → Resolve virtual module IDs (add \0 prefix)
5. load()             → Return cache data or generated virtual module code
6. transform()        → Extract pure functions + run deepkit transformers
7. buildEnd()         → Log injected pure function count
8. closeBundle()      → Kill persistent child process (IPC mode cleanup)
9. handleHotUpdate()  → Re-scan pure functions and regenerate AOT on file changes
```

---

## Pure Server Functions

### What They Are

Pure server functions are functions defined in client code that get executed on the server. They are registered via `pureServerFn()`, `mapFrom()`, or `registerPureFnFactory()`.

Key constraints (enforced at build time):

- **No closures** - only local scope, parameters, and allowed globals
- **No side effects** - no network calls, file I/O, or external state
- **No async** - no `await`, `yield`, or dynamic `import()`
- **Serializable** - can be sent between client and server as code strings

### Three APIs

```ts
// Simple pure function
pureServerFn((x) => x * 2);

// Pure function with definition object
pureServerFn({
  pureFn: (x) => x * 2,
  namespace: 'myNamespace',
  fnName: 'double',
});

// Factory function - receives jitUtils, returns a pure function
registerPureFnFactory('ns', 'fnId', (jitUtils) => (x) => jitUtils.validate(x));

// SubRequest mapper - pure function that transforms server responses
mapFrom(source, (data) => data.items);
```

### Extraction & Injection Flow

**Build time extraction** (`extractPureFn.ts`):

1. Scans `clientSrcPath` recursively for `.ts`, `.tsx`, `.vue` files
2. Parses each file's AST to find `pureServerFn()`, `mapFrom()`, `registerPureFnFactory()` calls
3. Validates purity by walking the function body AST (rejects closures, forbidden APIs, etc.)
4. Computes a `bodyHash` = SHA-256 of `namespace + normalizedBody` (base64url, 14 chars)

**Transform injection** (`transformers.ts`):

1. During `transform()`, a TypeScript custom transformer injects the computed `bodyHash` as an additional argument:
   - `pureServerFn(fn)` → `pureServerFn(fn, "abc1234567890")`
   - `mapFrom(src, fn)` → `mapFrom(src, fn, "abc1234567890")`
   - `registerPureFnFactory(ns, id, factory)` → `registerPureFnFactory(ns, id, factory, parsedFnObj)`
2. Injection is idempotent — already-injected calls are skipped (important for HMR)

**Virtual module** (`virtualModule.ts`):

- Generates `virtual:mion-server-pure-fns` containing a registry of all extracted functions
- Each entry includes: namespace, fnName, paramNames, code (body string), bodyHash, dependencies, and an executable `fn` property

---

## Transform Pipeline

The plugin runs two sets of TypeScript transformers in a single `ts.transpileModule` call:

```
ts.transpileModule(code, {
  before: [
    pureFnTransformer,           // 1st: inject bodyHash into pure function calls
    deepkit.beforeTransformers,  // 2nd: emit type metadata (__Ω symbols)
  ],
  after: [
    deepkit.afterTransformers,   // 3rd: declaration transform + require→import conversion
  ]
})
```

**Order matters**: Pure function extraction must see a clean TypeScript AST before deepkit adds type metadata.

### The require→import Transformer

Deepkit's type compiler defaults to CJS output in `transpileModule` context, emitting `var {__ΩFoo} = require("./bar.ts")`. The `requireToImport` transformer converts these back to ESM `import` statements so Rollup/Vite can properly resolve module specifiers.

### Vue SFC Support

For `.vue` files:

1. The plugin skips bare `.vue` imports (raw SFC template)
2. Waits for the Vue plugin to extract the `<script>` block
3. Processes the virtual module (e.g., `Component.vue?vue&type=script&lang=ts`)
4. Script content is extracted via regex + state machine that handles `</script>` inside string literals

---

## AOT Cache Generation

AOT pre-compiles JIT type functions and route metadata at build time, so the client bundle doesn't need `@deepkit/type` or `@mionjs/run-types` at runtime.

### Three Cache Types

| Virtual Module                  | Content                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `virtual:mion-aot/jit-fns`      | Compiled type check/validation functions                        |
| `virtual:mion-aot/pure-fns`     | Pre-extracted pure functions                                    |
| `virtual:mion-aot/router-cache` | Route metadata (method signatures, validators)                  |
| `virtual:mion-aot/caches`       | Combined module that imports all three + calls `addAOTCaches()` |

### How Caches Are Generated

The plugin needs to run the server's init script to extract type information and route metadata. This is controlled by the `server` configuration, which determines both the AOT generation strategy and the server process lifecycle.

---

## Server Modes

The `server.mode` option controls how the plugin spawns and manages the server process:

### `onlyAOT` Mode

Spawns a child process to generate AOT caches, then kills it. Use this when you only need AOT caches and don't need a running server during development (e.g., production builds).

```
┌─────────────────────┐         IPC (process.send)        ┌─────────────────────┐
│   PARENT PROCESS    │ ◄──────────────────────────────── │   CHILD PROCESS     │
│   (Vite build)      │                                    │   (vite-node)       │
│                     │                                    │                     │
│ 1. buildStart()     │    fork(vite-node, startScript,    │                     │
│ 2. spawn child ─────┼──► {env: MION_COMPILE=onlyAOT}) ─►│ 3. run startScript  │
│                     │                                    │ 4. initMionRouter() │
│                     │                                    │ 5. emitAOTCaches()  │
│ 7. store aotData    │ ◄── {type: 'mion-aot-caches', ◄── │ 6. process.send()   │
│ 8. write disk cache │        jitFnsCode, pureFnsCode,    │ 7. process exits    │
│                     │        routerCacheCode}            │                     │
└─────────────────────┘                                    └─────────────────────┘
```

**Flow:**

1. `buildStart()` calls `getOrGenerateAOTCaches()`
2. Spawns a child process via `fork(vite-node, [startScript], { env: { MION_COMPILE: 'onlyAOT' } })`
3. Child runs the start script through `vite-node` (with full Vite transform pipeline)
4. The router detects `MION_COMPILE=onlyAOT` and initializes routes without starting the HTTP server
5. `emitAOTCaches()` serializes all caches and sends them via `process.send()`
6. Parent receives the IPC message, stores the cache data, child process is killed
7. Disk cache is written (keyed by SHA-256 of source files + options + devtools version)

### `IPC` Mode

Spawns a child process to generate AOT caches via IPC, then **keeps the server running**. The plugin polls the configured `port` until the server is ready.

```
┌─────────────────────┐         IPC (process.send)        ┌─────────────────────┐
│   PARENT PROCESS    │ ◄──────────────────────────────── │   CHILD PROCESS     │
│   (Vite build)      │                                    │   (vite-node)       │
│                     │                                    │                     │
│ 1. buildStart()     │    fork(vite-node, startScript,    │                     │
│ 2. spawn child ─────┼──► {env: MION_COMPILE=serve})  ──►│ 3. run startScript  │
│                     │                                    │ 4. initMionRouter() │
│                     │                                    │ 5. emitAOTCaches()  │
│ 7. store aotData    │ ◄── {type: 'mion-aot-caches', ◄── │ 6. process.send()   │
│ 8. write disk cache │        jitFnsCode, pureFnsCode,    │ 7. server.listen()  │
│ 9. poll port ───────┼──► wait for HTTP response     ◄───│ 8. serving requests │
│ 10. serverReady ✓   │                                    │    ...              │
│                     │                                    │                     │
│ closeBundle()       │                                    │                     │
│  └─ kill child ─────┼──► SIGTERM ──────────────────────►│ exits               │
└─────────────────────┘                                    └─────────────────────┘
```

**Flow:**

1. `buildStart()` calls `getOrGenerateAOTCaches()`
2. Spawns a child process via `fork(vite-node, [startScript], { env: { MION_COMPILE: 'serve' } })`
3. Child runs the start script — the router initializes and emits AOT caches
4. Platform adapters detect `MION_COMPILE=serve` and proceed with `server.listen()`
5. Parent receives caches via IPC, stores data, writes disk cache
6. Parent polls `server.port` until the server responds (2xx or 404)
7. `serverReady` promise resolves — can be awaited in vitest `globalSetup`
8. On `closeBundle()`, the persistent child is killed (SIGTERM → SIGKILL after 5s)

### `viteSSR` Mode

Loads the server in the same Vite process using `ssrLoadModule`. Used with frameworks like Nuxt that run Vite in `middlewareMode`.

```
┌──────────────────────────────────────────────────┐
│              SAME PROCESS (Vite dev server)       │
│                                                   │
│ 1. configureServer() detects viteSSR mode         │
│ 2. Set MION_COMPILE=viteSSR                       │
│ 3. ssrLoadModule(startServerScript)               │
│ 4. Router initializes, getSerializedCaches()      │
│ 5. Store aotData (no disk cache in SSR mode)      │
│ 6. Load @mionjs/router + @mionjs/platform-node    │
│ 7. Set up dev proxy middleware for mion routes     │
│ 8. serverReady ✓                                  │
└──────────────────────────────────────────────────┘
```

**Flow:**

1. `configureServer()` detects `viteSSR` mode
2. Temporarily sets `MION_COMPILE=viteSSR`
3. Calls `ssrLoadModule(startServerScript)` to load the init script in the same process
4. Retrieves caches directly from the router via `getSerializedCaches()`
5. Loads `@mionjs/router` and `@mionjs/platform-node` modules
6. Sets up a middleware proxy that routes matching requests to mion's `httpRequestHandler`
7. `serverReady` promise resolves

**Key differences from IPC/onlyAOT:**

- No child process overhead
- No disk cache (HMR regenerates on each change)
- Uses the framework's module loader (Nuxt, etc.) instead of vite-node
- Includes a dev proxy middleware for routing API requests
- Risk of side effects since everything runs in the same process

### The MION_COMPILE Environment Variable

This is the coordination mechanism between the plugin and the server init script:

| Value     | Set by       | Meaning                                        |
| --------- | ------------ | ---------------------------------------------- |
| `onlyAOT` | onlyAOT mode | Generate caches then exit (skip server.listen) |
| `serve`   | IPC mode     | Generate caches and keep server running        |
| `viteSSR` | viteSSR mode | In-process SSR, skip server.listen             |
| _(unset)_ | Normal run   | Standard server startup, no AOT generation     |

```ts
// Server init script (user code)
const router = initMionRouter({
  /* routes */
});

if (process.env.MION_COMPILE !== 'onlyAOT') {
  await startNodeServer(router); // Skip server.listen() during onlyAOT
}
```

Platform adapters detect `MION_COMPILE` automatically — in `serve` mode they proceed with `server.listen()`, in `onlyAOT` and `viteSSR` modes they skip it.

### Server Ready Promise

The plugin exports a `serverReady` promise that resolves when the server is fully initialized:

- **onlyAOT mode**: resolves immediately after AOT caches are generated (no server to wait for)
- **IPC mode**: resolves after the server responds on the configured `port`
- **viteSSR mode**: resolves after SSR initialization completes

```ts
// vitest globalSetup — wait for the mion server before running tests
import {serverReady} from '@mionjs/devtools/vite-plugin';
export async function setup() {
  await serverReady;
}
```

The promise uses `globalThis` with `Symbol.for('mion.serverReady')` so it works across vitest's separate module contexts (vitest.config.ts and globalSetup.ts).

**Disk caching (onlyAOT/IPC only):** Subsequent builds skip the child process if sources haven't changed. Cache stored at `node_modules/.vite/mion-aot-cache.json` (configurable). Force regeneration with `MION_AOT_FORCE=true`.

---

## Data Flow: Init Script → Vite → Client Bundle

```
Server Init Script                    Vite Plugin                        Client Bundle
─────────────────                    ───────────                        ─────────────
                                     buildStart/configureServer
                                           │
initMionRouter()  ◄────── IPC/SSR ────────┤
  │                                        │
  ├─ compile types                         │
  ├─ build route table                     │
  ├─ collect JIT functions                 │
  │                                        │
emitAOTCaches() ──── IPC/SSR ────────►  aotData
                                           │
                                     resolveId/load virtual modules
                                           │
                                           ├─► virtual:mion-aot/jit-fns ──────► import { jitFnsCache }
                                           ├─► virtual:mion-aot/pure-fns ─────► import { pureFnsCache }
                                           ├─► virtual:mion-aot/router-cache ─► import { routerCache }
                                           └─► virtual:mion-aot/caches ───────► combined import
                                                                                  (auto-registers caches)
```

When `excludeReflection: true`, the plugin also stubs out `@mionjs/run-types`, `@deepkit/type`, and `@deepkit/core` with empty exports — since all type info is pre-computed in the AOT caches, these libraries are not needed in the client bundle.

---

## Virtual Modules Reference

| Module ID                       | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `virtual:mion-server-pure-fns`  | Registry of all extracted pure functions       |
| `virtual:mion-aot/jit-fns`      | Pre-compiled JIT type functions                |
| `virtual:mion-aot/pure-fns`     | Pre-extracted pure functions (from AOT)        |
| `virtual:mion-aot/router-cache` | Route metadata and method signatures           |
| `virtual:mion-aot/caches`       | Combined module (imports all + auto-registers) |

Custom prefix: Set `aotCaches.customVirtualModuleId` to use a different prefix (e.g., `'client-mion-aot'` → `virtual:client-mion-aot/jit-fns`).

---

## Configuration Reference

### MionPluginOptions

```ts
interface MionPluginOptions {
  serverPureFunctions?: ServerPureFunctionsOptions;
  runTypes?: DeepkitTypeOptions;
  aotCaches?: AOTCacheOptions;
  server?: MionServerConfig;
}
```

### MionServerConfig

| Option              | Type                              | Default  | Description                                                  |
| ------------------- | --------------------------------- | -------- | ------------------------------------------------------------ |
| `startServerScript` | `string`                          | required | Path to server init script that calls `initMionRouter()`     |
| `serverViteConfig`  | `string`                          | —        | Path to server's vite.config.ts (auto-discovered if omitted) |
| `mode`              | `'onlyAOT' \| 'IPC' \| 'viteSSR'` | required | Server process management strategy                           |
| `port`              | `number`                          | —        | Port to poll for server readiness (IPC mode)                 |
| `waitTimeout`       | `number`                          | `30000`  | Max wait time in ms for server readiness polling             |

### ServerPureFunctionsOptions

| Option          | Type       | Default                                               | Description                                                |
| --------------- | ---------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `clientSrcPath` | `string`   | required                                              | Directory to scan for pure functions                       |
| `include`       | `string[]` | `['**/*.ts', '**/*.tsx', '**/*.vue']`                 | Glob patterns to include                                   |
| `exclude`       | `string[]` | `['../node_modules/**', '**/.dist/**', '**/dist/**']` | Glob patterns to exclude                                   |
| `noViteClient`  | `boolean`  | `false`                                               | If true, requires explicit names in `pureServerFn()` calls |

### DeepkitTypeOptions

| Option            | Type                 | Default                   | Description                    |
| ----------------- | -------------------- | ------------------------- | ------------------------------ |
| `include`         | `string \| string[]` | `['**/*.tsx', '**/*.ts']` | Files to apply type reflection |
| `exclude`         | `string \| string[]` | `'node_modules/**'`       | Files to skip                  |
| `tsConfig`        | `string`             | auto-detected             | Path to tsconfig.json          |
| `reflection`      | `ReflectionMode`     | `'default'`               | Reflection mode                |
| `compilerOptions` | `CompilerOptions`    | —                         | Override tsconfig options      |

### AOTCacheOptions

| Option                  | Type                | Default | Description                           |
| ----------------------- | ------------------- | ------- | ------------------------------------- |
| `excludedFns`           | `string[]`          | —       | JIT function IDs to exclude           |
| `excludedPureFns`       | `string[]`          | —       | Pure function names to exclude        |
| `cache`                 | `boolean \| string` | `true`  | Enable disk cache / custom cache dir  |
| `excludeReflection`     | `boolean`           | —       | Stub out reflection modules in bundle |
| `customVirtualModuleId` | `string`            | —       | Custom virtual module prefix          |

---

## HMR Behavior

- **Client source changes**: Re-scans pure functions, invalidates `virtual:mion-server-pure-fns`
- **Server source changes**: Kills existing persistent child (if IPC mode), regenerates AOT caches (IPC/SSR), invalidates all `virtual:mion-aot/*` modules
- In IPC mode, HMR re-spawns the child process and re-polls the server port
- Pure function injection is idempotent — already-injected calls are skipped during HMR re-transforms
