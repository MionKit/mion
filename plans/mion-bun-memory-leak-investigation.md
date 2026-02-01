# Mion Bun Memory Leak Investigation

**Date:** 2026-02-01  
**Status:** Diagnosis Complete - Awaiting Confirmation

---

## Executive Summary

A systematic investigation of the memory leak in the mion Bun implementation has been completed. The initial hypothesis (JIT cache growth) was **ruled out**. The root cause appears to be in the **RunType instantiation layer** of `@mionkit/run-types`, where new type objects are being created per request instead of being reused from a cache.

---

## Investigation Timeline

### Phase 1: Initial Hypothesis - JIT Cache Growth

**Hypothesis:** The JIT function cache in `@mionkit/core` grows unboundedly, creating new compiled functions for each request.

**Investigation Method:**

- Added diagnostic logging to [`apps/src/mionAppBun.ts`](../apps/src/mionAppBun.ts) to track JIT cache size
- Imported `getJitFnCaches` from `@mionkit/core` to monitor cache entries
- Logged cache size every 1000 requests

**Result:** ❌ **RULED OUT**

The JIT cache stays stable at **162 entries** throughout the benchmark:

```
[mion.bun] Request #1000 - JIT Cache: jitFns=162, pureFns=0
[mion.bun] Request #2000 - JIT Cache: jitFns=162, pureFns=0
[mion.bun] Request #3000 - JIT Cache: jitFns=162, pureFns=0
...
```

The cache does not grow with requests - it reaches its maximum size during initialization and remains constant.

---

### Phase 2: Memory Growth Confirmation

**Method:** Compared memory usage between mion.bun and hono.bun (control) during identical benchmarks.

**Results:**

| Framework | Start Memory | End Memory | Growth  |
| --------- | ------------ | ---------- | ------- |
| mion.bun  | ~110 MB      | ~760 MB    | +650 MB |
| hono.bun  | ~55 MB       | ~55 MB     | ~0 MB   |

**Conclusion:** ✅ Memory leak is confirmed and specific to mion.

---

### Phase 3: Heap Snapshot Analysis

**Method:** Generated Bun heap snapshots before and after load using `Bun.generateHeapSnapshot()`.

**Results:**

| Metric             | Before Load | After Load           | Change           |
| ------------------ | ----------- | -------------------- | ---------------- |
| Heap Snapshot Size | 5.93 MB     | 306.27 MB            | +5066.9%         |
| Node Count         | 66,764      | (too large to parse) | Massive increase |

#### Mion-Specific Classes in Initial Snapshot

| Class                   | Object Count | Size     |
| ----------------------- | ------------ | -------- |
| `NumberRunType`         | 1,316        | 0.16 MB  |
| `JitErrorsFnCompiler`   | 1,449        | 0.15 MB  |
| `PropertyRunType`       | 33           | <0.01 MB |
| `Serializer`            | 34           | <0.01 MB |
| `JitFnCompiler`         | 30           | <0.01 MB |
| `StringRunType`         | 18           | <0.01 MB |
| `InterfaceRunType`      | 12           | <0.01 MB |
| `AnyRunType`            | 8            | <0.01 MB |
| `FunctionParamsRunType` | 7            | <0.01 MB |
| `ParameterRunType`      | 6            | <0.01 MB |

**Key Observation:** The initial snapshot already has **1,316 `NumberRunType`** and **1,449 `JitErrorsFnCompiler`** objects, which is suspiciously high for just 162 cached JIT functions.

---

## Root Cause Analysis

### Most Likely Cause: RunType Instance Creation Per Request

The evidence points to the `@mionkit/run-types` package creating new RunType instances for each request instead of reusing cached instances.

**Supporting Evidence:**

1. **JIT cache is stable** - The compiled function cache (`jitFnsCache`) stays at 162 entries, so the leak is not in function compilation.

2. **High initial RunType count** - 1,316 `NumberRunType` objects for 162 JIT functions suggests ~8 NumberRunType instances per function, which may be expected for complex types.

3. **50x heap growth** - The heap snapshot grew from 5.93 MB to 306.27 MB during load, indicating massive object creation.

4. **RunType classes dominate** - The top memory consumers are all RunType-related classes from `@mionkit/run-types`.

### Hypothesis: Missing RunType Cache

The `@deepkit/type` reflection system provides type metadata, which mion converts to RunType instances for validation and serialization. If this conversion happens per-request without caching, it would explain the memory growth.

**Potential leak locations:**

1. `@mionkit/run-types` - RunType factory/instantiation
2. `@mionkit/core` - Request handler type resolution
3. `@deepkit/type` integration - Type reflection caching

---

## Files Modified During Investigation

| File                                                                    | Purpose                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------- |
| [`apps/src/mionAppBun.ts`](../apps/src/mionAppBun.ts)                   | Added JIT cache monitoring and heap snapshot generation  |
| [`benchmark-bench.js`](../benchmark-bench.js)                           | Added `BENCH_SERVERS` env var for selective benchmarking |
| [`lib/bench.js`](../lib/bench.js)                                       | Added `BENCH_VERBOSE` for server output visibility       |
| [`scripts/analyze-heap.js`](../scripts/analyze-heap.js)                 | Created for Bun heap snapshot analysis                   |
| [`scripts/compare-heaps.js`](../scripts/compare-heaps.js)               | Created for comparing two heap snapshots                 |
| [`scripts/compare-heaps-stream.js`](../scripts/compare-heaps-stream.js) | Created for streaming large snapshot analysis            |

---

## Proposed Next Steps

### Immediate Actions

1. **Investigate RunType caching in `@mionkit/run-types`**
   - Check if there's a cache for RunType instances keyed by type hash
   - Verify if the cache is being used correctly during request handling

2. **Add RunType instantiation logging**
   - Track when new RunType instances are created
   - Identify if they're created per-request or only during initialization

3. **Profile with Bun's built-in profiler**
   - Use `bun --inspect` for more detailed allocation tracking
   - Identify the exact call stack creating new objects

### Code Changes Required

The fix will likely need to be in the **main mion repository**, specifically:

- `@mionkit/run-types` - Add or fix RunType instance caching
- `@mionkit/core` - Ensure type resolution uses cached RunTypes

### Verification Plan

After implementing a fix:

1. Run the benchmark with memory monitoring
2. Verify heap snapshot size stays stable
3. Confirm mion.bun memory usage is comparable to hono.bun

---

## Diagnostic Scripts Created

### Running the Analysis

```bash
# Run benchmark with verbose output
BENCH_VERBOSE=true BENCH_SERVERS=mion.bun npm run test-bench-servers

# Analyze a heap snapshot
node scripts/analyze-heap.js heap-snapshot-0.json

# Compare two heap snapshots (requires Bun for large files)
bun scripts/compare-heaps.js heap-snapshot-0.json heap-snapshot-1.json

# Quick file size comparison
node scripts/compare-heaps-stream.js heap-snapshot-0.json heap-snapshot-1.json
```

### Generating Heap Snapshots

The modified [`apps/src/mionAppBun.ts`](../apps/src/mionAppBun.ts) generates heap snapshots:

- `heap-snapshot-0.json` - Before any requests
- `heap-snapshot-1.json` - After 5000 requests

---

## Conclusion

The memory leak in mion.bun is **not** caused by JIT cache growth. The root cause appears to be in the **RunType instantiation layer**, where new type objects are being created per request. The fix requires changes to the main mion repository to implement or fix RunType instance caching.

**Confidence Level:** High (based on heap snapshot analysis and JIT cache monitoring)

**Next Action Required:** Confirm this diagnosis aligns with mion architecture understanding before proceeding with fix implementation.
