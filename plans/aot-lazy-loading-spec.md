# AOT Lazy Loading Specification

## Overview

This document specifies the AOT (Ahead-of-Time) Lazy Loading functionality for `@mionkit/router`. The goal is to make the router fail fast if AOT caches are not loaded correctly in strict mode, and to provide clear error messages when JIT functions are missing.

## Problem Statement

In secure environments like Cloudflare Workers, `new Function()` is not allowed, which means JIT compilation cannot be used at runtime. The router must rely on pre-compiled AOT caches. Currently, if AOT caches are not properly loaded, the router may fail silently or with unclear error messages.

## Solution

### 1. AOT Mode Configuration

Add a new `aotMode` option to `RouterOptions` with three modes:

- **`'auto'`** (default): Use AOT caches if available, fall back to JIT compilation if not
- **`'strict'`**: Require AOT caches, fail immediately if not loaded or incomplete
- **`'disabled'`**: Always use JIT compilation, ignore AOT caches

### 2. New Error Types

Add three new error classes to `@mionkit/core`:

#### `AOTCachesNotLoadedError`
Thrown when `aotMode: 'strict'` is enabled but no AOT caches have been loaded.

#### `AOTFunctionMissingError`
Thrown when a required JIT function is not found in the cache during strict mode.

#### `AOTRouterCacheMissingError`
Thrown when a route is not found in the persisted methods cache during strict mode.

### 3. Cache State Functions

Add helper functions to `@mionkit/core` for checking cache state:

- `isAOTCacheLoaded()`: Returns true if AOT caches have been loaded
- `getJitCacheSize()`: Returns the number of JIT functions in the cache
- `getPureCacheSize()`: Returns the number of pure functions in the cache
- `hasJitFunctionInCache(hash: string)`: Check if a specific JIT function exists
- `hasPureFunctionInCache(hash: string)`: Check if a specific pure function exists

### 4. Validation Logic

#### Router Initialization
When `initRouter()` is called with `aotMode: 'strict'`:
1. Check if AOT caches have been loaded using `isAOTCacheLoaded()`
2. If not loaded, throw `AOTCachesNotLoadedError`

#### Method Cache Restoration
When `restorePersistedMethod()` is called in strict mode:
1. Check if the route exists in the persisted methods cache
2. If not, throw `AOTRouterCacheMissingError`
3. Check if the required JIT functions exist in the cache
4. If not, throw `AOTFunctionMissingError`

## Implementation Details

### Files to Modify

1. **`packages/core/src/errors.ts`**
   - Add `AOTCachesNotLoadedError` class
   - Add `AOTFunctionMissingError` class
   - Add `AOTRouterCacheMissingError` class

2. **`packages/core/src/jitUtils.ts`**
   - Add `aotCachesLoaded` flag
   - Add `isAOTCacheLoaded()` function
   - Add `getJitCacheSize()` function
   - Add `getPureCacheSize()` function
   - Add `hasJitFunctionInCache()` function
   - Add `hasPureFunctionInCache()` function

3. **`packages/router/src/types/general.ts`**
   - Add `AOTMode` type
   - Add `aotMode` property to `RouterOptions`

4. **`packages/router/src/constants.ts`**
   - Add default `aotMode: 'auto'` to `DEFAULT_ROUTE_OPTIONS`

5. **`packages/router/src/router.ts`**
   - Add `validateAOTMode()` function
   - Call validation in `initRouter()`

6. **`packages/router/src/lib/methodsCache.ts`**
   - Add `setAOTMode()` and `getAOTMode()` functions
   - Modify `getPersistedMethod()` to validate in strict mode
   - Modify `restorePersistedMethod()` to validate JIT functions in strict mode

## Usage Example

```typescript
import { initRouter, registerRoutes } from '@mionkit/router';
import { addAOTCaches } from '@mionkit/core';
import { jitFnsCache, pureFnsCache } from 'my-api-aot';

// Load AOT caches BEFORE initializing router
addAOTCaches(jitFnsCache, pureFnsCache);

// Initialize router in strict mode - will fail if caches not loaded
initRouter({
  aotMode: 'strict',
});

registerRoutes(myRoutes);
```

## Error Messages

### AOTCachesNotLoadedError
```
AOT caches not loaded. In strict mode, AOT caches must be loaded before initializing the router.
Call addAOTCaches() before initRouter() or use aotMode: 'auto'.
```

### AOTFunctionMissingError
```
AOT function missing for route '{routeId}'. JIT function with hash '{hash}' not found in cache.
Ensure AOT caches are properly generated and loaded.
```

### AOTRouterCacheMissingError
```
Route '{routeId}' not found in AOT router cache.
Ensure AOT caches are properly generated and include this route.
```
