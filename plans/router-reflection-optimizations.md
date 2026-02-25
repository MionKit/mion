# Router Reflection Optimizations

**Date:** 2026-02-01  
**File:** `packages/router/src/lib/reflection.ts`  
**Related Files:** `packages/router/src/lib/methodsCache.ts`, `packages/core/src/routerUtils.ts`

---

## Summary of Issues Found

After analyzing the [`reflection.ts`](../packages/router/src/lib/reflection.ts) file, I've identified several optimization opportunities that could contribute to memory issues and performance problems.

---

## Issue 1: Direct Access to `persistedMethods` Instead of Using Getter

**Location:** Lines 15, 153, 174

**Current Code:**

```typescript
import {persistedMethods} from './methodsCache';
// ...
const cached = persistedMethods[routeId];
```

**Problem:**

- Direct access to the exported `let` variable bypasses any encapsulation
- Makes it harder to add caching logic, logging, or other middleware
- Inconsistent with the pattern used elsewhere - `getPersistedMethod()` exists but isn't used

**Recommendation:**
Use the `getPersistedMethod()` function or create a simpler getter that doesn't require the handler parameter.

```typescript
// In methodsCache.ts - add a simple getter
export function getPersistedMethodMetadata(id: string): MethodMetadata | undefined {
  return persistedMethods[id];
}

// In reflection.ts
import {getPersistedMethodMetadata} from './methodsCache';
// ...
const cached = getPersistedMethodMetadata(routeId);
```

---

## Issue 2: `extractReflectionFromCached` Creates New Objects Every Time

**Location:** Lines 106-136

**Current Code:**

```typescript
function extractReflectionFromCached(cached: MethodMetadata): MethodReflect {
  const reflectionItems: MethodReflect = {
    paramNames: cached.paramNames || [],
    paramsJitFns: getJitFunctionsFromHash(cached.paramsJitHash),
    returnJitFns: getJitFunctionsFromHash(cached.returnJitHash),
    // ... more properties
  };
  // ... more object creation for headers
  return reflectionItems;
}
```

**Problem:**

- Creates a new `MethodReflect` object every time it's called
- Calls `getJitFunctionsFromHash()` multiple times which creates new objects
- If called repeatedly for the same route, this creates unnecessary garbage

**Recommendation:**
Cache the extracted reflection on the `MethodMetadata` object itself:

```typescript
// Extend MethodMetadata type to include cached reflection
type CachedMethodMetadata = MethodMetadata & {
  _cachedReflection?: MethodReflect;
};

function extractReflectionFromCached(cached: CachedMethodMetadata): MethodReflect {
  // Return cached reflection if available
  if (cached._cachedReflection) return cached._cachedReflection;

  const reflectionItems: MethodReflect = {
    paramNames: cached.paramNames || [],
    paramsJitFns: getJitFunctionsFromHash(cached.paramsJitHash),
    returnJitFns: getJitFunctionsFromHash(cached.returnJitHash),
    paramsJitHash: cached.paramsJitHash,
    returnJitHash: cached.returnJitHash,
    hasReturnData: cached.hasReturnData,
    isAsync: cached.isAsync,
  };

  // Restore headers param if present
  if (cached.headersParam) {
    reflectionItems.headersParam = {
      headerNames: cached.headersParam.headerNames,
      jitFns: getJitFunctionsFromHash(cached.headersParam.jitHash) as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>,
      jitHash: cached.headersParam.jitHash,
    };
  }

  // Restore headers return if present
  if (cached.headersReturn) {
    reflectionItems.headersReturn = {
      headerNames: cached.headersReturn.headerNames,
      jitFns: getJitFunctionsFromHash(cached.headersReturn.jitHash) as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>,
      jitHash: cached.headersReturn.jitHash,
    };
  }

  // Cache for future calls
  cached._cachedReflection = reflectionItems;
  return reflectionItems;
}
```

---

## Issue 3: `getJitFunctionsFromHash` Creates New Objects

**Location:** `packages/core/src/routerUtils.ts` lines 200-218

**Current Code:**

```typescript
export function getJitFunctionsFromHash(jitHash: string): JitCompiledFunctions {
  if (jitHash === EMPTY_HASH) return noopJitFns;

  const hashes = getJitFnHashes(jitHash);
  const jUtils = getJitUtils();
  const jitFns = {
    isType: jUtils.getJIT(hashes.isType),
    typeErrors: jUtils.getJIT(hashes.typeErrors),
    // ... more lookups
  } as JitCompiledFunctions;
  // ...
  return jitFns;
}
```

**Problem:**

- Creates a new `JitCompiledFunctions` object every time
- The underlying JIT functions are cached, but the wrapper object is not
- Called multiple times from `extractReflectionFromCached`

**Recommendation:**
Add a cache for the `JitCompiledFunctions` objects:

```typescript
// Cache for JitCompiledFunctions objects keyed by jitHash
const jitFunctionsCache = new Map<string, JitCompiledFunctions>();

export function getJitFunctionsFromHash(jitHash: string): JitCompiledFunctions {
  if (jitHash === EMPTY_HASH) return noopJitFns;

  // Check cache first
  const cached = jitFunctionsCache.get(jitHash);
  if (cached) return cached;

  const hashes = getJitFnHashes(jitHash);
  const jUtils = getJitUtils();
  const jitFns = {
    isType: jUtils.getJIT(hashes.isType),
    typeErrors: jUtils.getJIT(hashes.typeErrors),
    prepareForJson: jUtils.getJIT(hashes.prepareForJson),
    restoreFromJson: jUtils.getJIT(hashes.restoreFromJson),
    stringifyJson: jUtils.getJIT(hashes.stringifyJson),
    toBinary: jUtils.getJIT(hashes.toBinary),
    fromBinary: jUtils.getJIT(hashes.fromBinary),
  } as JitCompiledFunctions;

  for (const key in jitFns) {
    if (!jitFns[key]) throw new Error(`Jit function ${key} not found for jitHash ${jitHash}`);
  }

  // Cache for future calls
  jitFunctionsCache.set(jitHash, jitFns);
  return jitFns;
}

// Add reset function for testing
export function resetJitFunctionsCache(): void {
  jitFunctionsCache.clear();
}
```

---

## Issue 4: `createUseRawFnReflection` Creates New Objects

**Location:** Lines 88-98

**Current Code:**

```typescript
function createUseRawFnReflection(isAsync: boolean, hasReturnData: boolean = false, paramNames: string[] = []): MethodReflect {
  return {
    paramNames,
    paramsJitFns: getNoopJitFns(),
    returnJitFns: getNoopJitFns(),
    paramsJitHash: EMPTY_HASH,
    returnJitHash: EMPTY_HASH,
    hasReturnData,
    isAsync,
  };
}
```

**Problem:**

- Creates a new object every time
- For raw useFns with the same parameters, this creates duplicate objects

**Recommendation:**
Cache common cases:

```typescript
// Cache for common raw useFn reflections
const useRawFnReflectionCache = new Map<string, MethodReflect>();

function createUseRawFnReflection(isAsync: boolean, hasReturnData: boolean = false, paramNames: string[] = []): MethodReflect {
  // Create cache key from parameters
  const cacheKey = `${isAsync}_${hasReturnData}_${paramNames.join(',')}`;

  const cached = useRawFnReflectionCache.get(cacheKey);
  if (cached) return cached;

  const reflection: MethodReflect = {
    paramNames,
    paramsJitFns: getNoopJitFns(),
    returnJitFns: getNoopJitFns(),
    paramsJitHash: EMPTY_HASH,
    returnJitHash: EMPTY_HASH,
    hasReturnData,
    isAsync,
  };

  useRawFnReflectionCache.set(cacheKey, reflection);
  return reflection;
}
```

---

## Issue 5: Duplicate Logic Between `reflection.ts` and `routerUtils.ts`

**Observation:**
Both files have similar caching patterns:

- `reflection.ts` has `extractReflectionFromCached()`
- `routerUtils.ts` has `routesCache.getMethodJitFns()`

Both do similar work of restoring JIT functions from hashes.

**Recommendation:**
Consider consolidating the caching logic to avoid duplication and ensure consistent behavior.

---

## Issue 6: `getFunctionJitFns` Calls `reflectFunction` Every Time

**Location:** Lines 411-430

**Current Code:**

```typescript
function getFunctionJitFns<Fn extends AnyFn>(
  fn: Fn,
  opts: RunTypeOptions | undefined,
  rtModule: RunTypesFunctions,
  isReturn: boolean
): JitCompiledFunctions {
  const runType = rtModule.reflectFunction(fn); // Called every time!
  // ...
}
```

**Problem:**

- `reflectFunction(fn)` is called every time `getFunctionJitFns` is called
- This is the main entry point that creates RunType instances
- If the same function is reflected multiple times, this creates duplicate RunTypes

**Recommendation:**
This is actually the root cause of the memory leak! The fix in `run-types` package (caching RunType instances) should address this. However, we could also add a local cache here as a defense-in-depth measure:

```typescript
// Cache for function RunTypes
const functionRunTypeCache = new WeakMap<AnyFn, FunctionRunType>();

function getFunctionJitFns<Fn extends AnyFn>(
  fn: Fn,
  opts: RunTypeOptions | undefined,
  rtModule: RunTypesFunctions,
  isReturn: boolean
): JitCompiledFunctions {
  // Check cache first
  let runType = functionRunTypeCache.get(fn);
  if (!runType) {
    runType = rtModule.reflectFunction(fn);
    functionRunTypeCache.set(fn, runType);
  }

  const createFn = isReturn
    ? runType.createJitCompiledReturnFunction.bind(runType)
    : runType.createJitCompiledParamsFunction.bind(runType);
  // ...
}
```

---

## Summary of Recommended Changes

| Priority   | Issue                                       | File           | Impact                              |
| ---------- | ------------------------------------------- | -------------- | ----------------------------------- |
| **High**   | Cache `extractReflectionFromCached` results | reflection.ts  | Reduces object creation per request |
| **High**   | Cache `getJitFunctionsFromHash` results     | routerUtils.ts | Reduces object creation per request |
| **High**   | Cache `reflectFunction` results             | reflection.ts  | Prevents duplicate RunType creation |
| **Medium** | Use getter for `persistedMethods`           | reflection.ts  | Better encapsulation                |
| **Medium** | Cache `createUseRawFnReflection` results | reflection.ts  | Reduces object creation             |
| **Low**    | Consolidate caching logic                   | Both files     | Code maintainability                |

---

## Implementation Order

1. **First:** Fix the RunType caching in `run-types` package (main fix)
2. **Second:** Add `getJitFunctionsFromHash` caching in `routerUtils.ts`
3. **Third:** Add `extractReflectionFromCached` caching in `reflection.ts`
4. **Fourth:** Add `reflectFunction` caching in `reflection.ts` (defense-in-depth)
5. **Fifth:** Refactor to use getter for `persistedMethods`
6. **Sixth:** Cache `createUseRawFnReflection` results

---

## Testing Recommendations

1. Add tests to verify caching behavior:
   - Same route ID returns same cached object
   - Cache doesn't grow unboundedly
   - Reset functions clear caches properly

2. Add memory tests:
   - Measure object creation count before/after optimizations
   - Verify memory stays stable during load testing

3. Add performance benchmarks:
   - Measure time to get reflection data
   - Compare before/after optimization
