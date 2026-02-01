# Router Build Optimization: Remove Unnecessary Type Reflection

## Overview

This document outlines the build optimization for removing unnecessary Deepkit type reflection from the router and platform adapter packages.

---

## Background

The Deepkit type compiler adds runtime artifacts and wraps functions to enable type reflection. However, many files in the router and platform adapter packages do not require reflection capabilities. Removing reflection from these files can:

- **Reduce bundle size** - Less generated code
- **Improve startup time** - Fewer runtime initializations
- **Improve execution speed** - No reflection wrapper overhead on function calls
- **Simplify debugging** - Cleaner stack traces

---

## Current State

The `@mionkit/core` package already excludes several files from reflection via the `exclude` option in [`packages/core/vite.config.ts`](packages/core/vite.config.ts:42):

```typescript
deepkitType({
    tsConfig: resolve(__dirname, 'tsconfig.json'),
    compilerOptions: {sourceMap: true},
    exclude: '**/{utils,jitUtils,routerUtils,restoreJitFns,dataView,bodySerializer,bodyDeserializer,friendlyErrors}.ts',
}),
```

However, the router package and all platform adapters currently have **no exclusions**.

---

## Proposed Changes

### 1. Router Package Exclusions

Add exclusions to [`packages/router/vite.config.ts`](packages/router/vite.config.ts):

```typescript
deepkitType({
    tsConfig: resolve(__dirname, 'tsconfig.json'),
    compilerOptions: {sourceMap: true},
    exclude: '**/{dispatch,handlers,headers,methodsCache,dispatchError,constants}.ts',
}),
```

**Files to exclude from reflection:**

| File                                                                   | Reason                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| [`src/dispatch.ts`](packages/router/src/dispatch.ts)                   | Pure dispatch logic, no type introspection needed |
| [`src/lib/handlers.ts`](packages/router/src/lib/handlers.ts)           | Simple factory functions, types are inferred      |
| [`src/lib/headers.ts`](packages/router/src/lib/headers.ts)             | Header utilities, no reflection needed            |
| [`src/lib/methodsCache.ts`](packages/router/src/lib/methodsCache.ts)   | Cache management, no reflection needed            |
| [`src/lib/dispatchError.ts`](packages/router/src/lib/dispatchError.ts) | Error handling utilities                          |
| [`src/constants.ts`](packages/router/src/constants.ts)                 | Static constants                                  |

**Files that MUST keep reflection:**

| File                    | Reason                                 |
| ----------------------- | -------------------------------------- |
| `src/router.ts`         | Uses reflection for route registration |
| `src/lib/reflection.ts` | Core reflection functionality          |
| `src/routes/*.ts`       | Route handlers that need type metadata |
| `src/types/*.ts`        | Type definitions used for reflection   |

### 2. Platform Adapter Packages - Complete Exclusion

Platform adapters like HTTP, AWS, Bun, and GCloud do **not** need any type reflection. They only:

- Call `dispatchRoute()` from the router
- Handle platform-specific request/response conversion
- Manage server lifecycle

**Packages to completely exclude from reflection:**

| Package           | Config File                                                    |
| ----------------- | -------------------------------------------------------------- |
| `@mionkit/http`   | [`packages/http/vite.config.ts`](packages/http/vite.config.ts) |
| `@mionkit/aws`    | [`packages/aws/vite.config.ts`](packages/aws/vite.config.ts)   |
| `@mionkit/bun`    | [`packages/bun/vite.config.ts`](packages/bun/vite.config.ts)   |
| `@mionkit/gcloud` | `packages/gcloud/vite.config.ts`                               |

**Proposed change for each adapter:**

```typescript
deepkitType({
    tsConfig: resolve(__dirname, 'tsconfig.json'),
    compilerOptions: {sourceMap: true},
    exclude: '**/*.ts', // Exclude ALL files from reflection
}),
```

Or alternatively, remove the `deepkitType` plugin entirely from these packages if no reflection is needed at all.

---

## Implementation Steps

1. **Audit each file** - Verify no reflection APIs are used
2. **Update vite configs** - Add appropriate `exclude` patterns
3. **Run tests** - Ensure all functionality still works
4. **Benchmark** - Measure bundle size and startup time improvements

---

## Expected Benefits

| Metric                 | Expected Improvement              |
| ---------------------- | --------------------------------- |
| Bundle size (router)   | ~5-10% reduction                  |
| Bundle size (adapters) | ~10-20% reduction                 |
| Startup time           | Faster initialization             |
| Runtime performance    | Marginal improvement in hot paths |

---

## Testing Considerations

Each change should include:

1. **Unit tests** - Ensure all existing tests pass
2. **Integration tests** - Verify dispatch behavior remains consistent
3. **Build verification** - Confirm packages build correctly without reflection

---

## Backward Compatibility

These changes are purely build-time optimizations and should maintain full backward compatibility with:

1. Existing route definitions
2. Platform adapters (HTTP, AWS, GCloud, Bun)
3. Client library expectations
4. AOT compilation cache format
