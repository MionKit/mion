# AOT (Ahead-of-Time) Codegen Overview

## Purpose and Architecture

The `@mionkit/codegen` package provides **Ahead-of-Time (AOT) code generation** functionality for mion applications.
AOT compilation pre-compiles critical runtime functions at build time.
This has few benefits:

- Improving application startup performance and memory.
- Run in secure environments as no `new Function` is used.
- **Lazy loading**: When `aot: true` is set, the heavy `@mionkit/run-types` package is NOT loaded at all.

The AOT compilation generates a package that can be published and installed independently using npm or similar.

### Key Goals

- **Performance Optimization**: Pre-compile JIT functions, pure functions, and router methods before deployment
- **Startup Speed**: Eliminate runtime compilation overhead by loading pre-built caches
- **Dual Module Support**: Generate both CommonJS (CJS) and ES Module (ESM) formats
- **Transparent Integration**: Load AOT caches seamlessly into the mion runtime
- **Lazy Loading**: In AOT mode, `@mionkit/run-types` is never loaded, reducing bundle size and memory usage

## CLI Commands

#### 1. `mion-init-aot` - Creates a Package that contains all caches files.

```bash
npx mion-init-aot --dir <directory> [--package-name <name>]
```

#### 2. `mion-build-aot` - Build AOT Caches into the package previously created.

```bash
npx mion-build-aot --dir <aot-directory> --start-server-script <script-path>
```

## AOT Package

The Created AOT package has the following Files:

- **`index.ts`**: Exports `loadAOTCaches()` function
- **`router.cache.ts`**: Placeholder for router cache
- **`jitFns.cache.ts`**: Placeholder for JIT functions cache
- **`pureFns.cache.ts`**: Placeholder for pure functions cache

## Usage Examples

### Step 1: Initialize AOT Package

```bash
# Create a new AOT package
npx mion-init-aot --dir ./packages/my-api-aot --package-name my-api-aot
```

### Step 2: Build Your Application

```bash
# Compile your TypeScript application
npm run build
```

### Step 3: Generate AOT Caches

Important !!!!  
The start server script must be the same as the one you use to start your server in production.
This guarantees the caches for routes and jitFunctions are the same used in your app.

```bash
# Run AOT compilation with your start script
npx mion-build-aot \
  --dir ./packages/my-api-aot \
  --start-server-script ./dist/cjs/my-api/init.js
```

### Step 4: Load Caches in Your Application

```typescript
// In your application startup code
import {loadAOTCaches} from 'my-api-aot';

// Load pre-compiled caches BEFORE initializing the router
loadAOTCaches();

// Now initialize your router and routes (async)
import {initMionRouter} from '@mionkit/router';
const myApi = await initMionRouter(myRoutes, {aot: true});
```

## AOT Mode Option

When initializing the router, you can enable AOT mode by setting `aot: true`:

```typescript
import {initMionRouter} from '@mionkit/router';

// Enable AOT mode - run-types package will NOT be loaded
const myApi = await initMionRouter(routes, {aot: true});
```

### Benefits of AOT Mode

1. **No `@mionkit/run-types` loading**: The heavy run-types package is never imported
2. **Faster cold starts**: No runtime type reflection or JIT compilation
3. **Smaller bundles**: With proper tree-shaking, run-types is excluded from production bundles
4. **Secure environments**: No `new Function()` calls at runtime

### AOT Mode Validation

When `aot: true` is set, the router validates that all routes and linkedFns have their JIT functions in the AOT cache. If any route is missing from the cache, an `AOTCacheError` is thrown:

```
AOTCacheError: Route/linkedFn "users/getUser" not found in AOT cache.
Regenerate AOT caches using 'mion-build-aot' command.
```

This fail-fast behavior ensures you don't accidentally deploy with incomplete AOT caches.
