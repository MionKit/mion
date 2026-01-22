# AOT Lazy Loading for @mionkit/router

## Problem Statement

Currently, the `@mionkit/router` package imports `@mionkit/run-types` directly via static imports in [`packages/router/src/lib/reflection.ts`](packages/router/src/lib/reflection.ts). This means the entire run-types package is loaded even when running in AOT mode where all JIT functions and router metadata are pre-compiled and cached.

### Issues with Current Approach

1. **Bundle Size**: The `@mionkit/run-types` package is heavy and includes the entire type reflection system
2. **Secure Environments**: AOT mode is designed for secure environments that don't allow `new Function()` - but currently run-types is still loaded
3. **Startup Performance**: Loading run-types adds unnecessary overhead when all functions are already in cache
4. **Memory Usage**: The reflection system consumes memory even when not needed

## Goals

1. **Lazy load run-types**: Only import `@mionkit/run-types` when actually needed (non-AOT mode)
2. **AOT validation**: In AOT mode, validate that all routes/hooks have their JIT functions in cache
3. **Fail fast**: Throw clear errors if AOT cache is incomplete rather than silently falling back
4. **Async initialization**: Make `initRouter` and `registerRoutes` async to enable dynamic imports
5. **Centralized reflection**: All run-types loading logic encapsulated in `reflection.ts`

## Architecture Overview

The key insight is that **all run-types functionality is encapsulated in [`packages/router/src/lib/reflection.ts`](packages/router/src/lib/reflection.ts)**. This module is the single point of contact between the router and run-types, making it the ideal place to implement AOT/dynamic loading logic.

```mermaid
flowchart TD
    subgraph reflection.ts - Central Loading Logic
        A[getHandlerReflection] --> B{Check AOT Cache}
        B -->|Found in Cache| C[Return Cached Data]
        B -->|Not in Cache| D{AOT Mode?}
        D -->|Yes| E[Throw AOTCacheError]
        D -->|No| F[Dynamic Import run-types]
        F --> G[Generate JIT Functions]
        G --> H[Store in Cache]
        H --> I[Return Generated Data]
        C --> J[Return MethodReflect]
        I --> J
    end

    subgraph Router
        K[registerRoutes] --> L[getExecutableFromRoute]
        L --> A
        M[getExecutableFromHook] --> A
        N[getExecutableFromRawHook] --> O[getRawMethodReflection]
        O --> B
    end

    subgraph Data Sources
        P[AOT Cache - persistedMethods] --> B
        Q[run-types Package] --> F
    end
```

## Implementation Strategy

### Phase 1: Reflection Module First

The first and most critical step is to refactor [`packages/router/src/lib/reflection.ts`](packages/router/src/lib/reflection.ts) to:

1. Check AOT cache first for any reflection request
2. If found in cache, return cached data (no run-types needed)
3. If not in cache and AOT mode, throw `AOTCacheError`
4. If not in cache and non-AOT mode, dynamically import run-types

**This module must be thoroughly tested before proceeding with other changes.**

Create [`packages/router/src/lib/reflection-aot.spec.ts`](packages/router/src/lib/reflection-aot.spec.ts) to verify:

- AOT cache hit returns cached data without loading run-types
- AOT cache miss in AOT mode throws `AOTCacheError`
- AOT cache miss in non-AOT mode dynamically loads run-types
- Dynamic import only happens once (module is cached)

## Detailed Design

### 1. Router Options Extension

Add `aot` flag to [`RouterOptions`](packages/router/src/types/general.ts:28):

```typescript
export interface RouterOptions<Req = any, ContextData extends Record<string, any> = any> extends CoreOptions {
  // ... existing options ...

  /**
   * Enable AOT (Ahead-of-Time) mode.
   * When true, router will use pre-compiled JIT functions from cache
   * and will NOT load @mionkit/run-types package.
   * Throws error if any route/hook is missing from AOT cache.
   * @default false
   */
  aot: boolean;
}
```

### 2. Reflection Module Refactoring

Transform [`packages/router/src/lib/reflection.ts`](packages/router/src/lib/reflection.ts) to be the central point for AOT/run-types loading:

### 3. Reflection AOT Test File

Create [`packages/router/src/lib/reflection-aot.spec.ts`](packages/router/src/lib/reflection-aot.spec.ts):

### 4. Async Router Functions

After reflection.ts is working and tested, make router functions async:

```typescript
// packages/router/src/router.ts

export async function initRouter(opts?: Partial<RouterOptions>): Promise<Readonly<RouterOptions>> {
  if (isRouterInitialized) throw new Error('Router has already been initialized');
  routerOptions = {...routerOptions, ...opts};
  validateSharedDataFactory(routerOptions);
  Object.freeze(routerOptions);
  setErrorOptions(routerOptions);
  isRouterInitialized = true;
  await registerRoutes({...mionErrorsRoutes});
  if (!routerOptions.skipClientRoutes) await registerRoutes({...mionClientRoutes});
  return routerOptions;
}

export async function registerRoutes<R extends Routes>(routes: R): Promise<PublicApi<R>> {
  if (!isRouterInitialized) throw new Error('initRouter should be called first');

  startHooks = await getExecutablesFromHooksCollectionAsync(startHooksDef);
  endHooks = await getExecutablesFromHooksCollectionAsync(endHooksDef);
  await recursiveFlatRoutesAsync(routes);

  if (shouldFullGenerateSpec()) return getPublicApi(routes);
  return {} as PublicApi<R>;
}

export async function initMionRouter<R extends Routes>(routes: R, opts?: Partial<RouterOptions>): Promise<PublicApi<R>> {
  await initRouter(opts);
  return registerRoutes(routes);
}
```

## Implementation Tasks

### Phase 1: Reflection Module (FIRST PRIORITY)

- [ ] Add `aot` option to `RouterOptions` interface
- [ ] Create `AOTCacheError` class in reflection.ts
- [ ] Convert static imports to type-only imports in reflection.ts
- [ ] Create `loadRunTypes()` async function for dynamic import
- [ ] Create `extractReflectionFromCached()` helper function
- [ ] Make `getHandlerReflection()` async with AOT cache check
- [ ] Make `getRawMethodReflection()` async with AOT cache check
- [ ] Update all helper functions to accept run-types module as parameter
- [ ] **Create `reflection-aot.spec.ts` test file**
- [ ] **Run and verify all reflection tests pass**

Note on AOT Validation Testing: For testing AOT cache validation, we can mock the AOT cache data before starting the router. This allows us to test scenarios like:

### Phase 2: Router Initialization (After Phase 1 is complete and tested)

- [ ] Make `initRouter()` async
- [ ] Make `registerRoutes()` async
- [ ] Make `initMionRouter()` async
- [ ] Create async versions of route processing functions:
  - [ ] `recursiveFlatRoutesAsync()`
  - [ ] `recursiveCreateExecutionPathAsync()`
  - [ ] `getExecutableFromHookAsync()`
  - [ ] `getExecutableFromRawHookAsync()`
  - [ ] `getExecutableFromRouteAsync()`
  - [ ] `getExecutablesFromHooksCollectionAsync()`

### Phase 3: Testing Updates

- [ ] Update all router tests to use `await` with `initRouter()` and `registerRoutes()`
- [ ] Update all platform adapter tests (http, aws, gcloud) to use async initialization
- [ ] Add integration tests for complete AOT workflow

**Note on AOT Validation Testing:** For testing AOT cache validation, we can mock the AOT cache data before starting the router. This allows us to test scenarios like:

- Complete cache (all routes present) - should succeed
- Incomplete cache (missing routes) - should throw AOTCacheError
- Cache with missing JIT functions - should throw AOTCacheError

### Phase 4: Update Examples and Documentation

- [ ] Update all examples to use `await initMionRouter()`
- [ ] Update AOT-OVERVIEW.md with new `aot` option
- [ ] Add migration guide for existing users

## Error Messages

### AOT Cache Missing Route

```
AOTCacheError: Route/hook "users/getUser" not found in AOT cache.
Regenerate AOT caches using 'mion-build-aot' command.
```

### AOT Cache Missing Raw Hook

```
AOTCacheError: Raw hook "mionDeserializeRequest" not found in AOT cache.
Regenerate AOT caches using 'mion-build-aot' command.
```

## Migration Guide

### Before (Sync)

```typescript
// Router initialization
initRouter({contextDataFactory: getSharedData});
registerRoutes({myRoute});

// Tests
beforeAll(() => {
  resetRouter();
  initRouter({contextDataFactory: getSharedData});
  registerRoutes({myRoute});
});

// Examples
initMionRouter(routes, options);
startNodeServer({port: 3000});
```

### After (Async)

```typescript
// Router initialization
await initRouter({contextDataFactory: getSharedData});
await registerRoutes({myRoute});

// Tests
beforeAll(async () => {
  resetRouter();
  await initRouter({contextDataFactory: getSharedData});
  await registerRoutes({myRoute});
});

// Examples
await initMionRouter(routes, options);
startNodeServer({port: 3000});
```

### AOT Mode Usage

```typescript
// Load AOT caches first
import {loadAOTCaches} from 'my-api-aot';
loadAOTCaches();

// Initialize router in AOT mode
await initMionRouter(routes, {aot: true});
startNodeServer({port: 3000});
```

## Performance Considerations

1. **Cold start improvement**: In AOT mode, no run-types loading = faster cold starts
2. **Memory reduction**: run-types module not loaded = less memory usage
3. **Bundle size**: With proper tree-shaking, run-types excluded from AOT bundles
4. **Initialization**: Async initialization adds minimal overhead (< 1ms in AOT mode)

## Security Considerations

1. **No `new Function()`**: In AOT mode, all JIT functions are pre-compiled, no runtime code generation
2. **Fail-fast validation**: Incomplete AOT cache throws immediately, preventing runtime issues
3. **Clear error messages**: Help developers identify and fix AOT cache issues quickly
