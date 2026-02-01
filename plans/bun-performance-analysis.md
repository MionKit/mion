# Mion Bun Wrapper Performance Analysis

## Executive Summary

The mion.bun benchmark shows **severe memory issues** - using **5017 MB** compared to **55-71 MB** for other Bun frameworks (Hono, Elysia). This represents a **~70-90x memory overhead**. The analysis below compares the mion Bun wrapper implementation against Hono and Elysia to identify fundamental differences and potential optimizations.

## Benchmark Results Comparison

| Framework  | Requests/s | Latency (ms) | Max Memory (MB) | Max CPU (%) |
| ---------- | ---------- | ------------ | --------------- | ----------- |
| hono.bun   | 25,034     | 40.22        | 71              | 109         |
| elysia.bun | 21,952     | 45.99        | 55              | 103         |
| mion.bun   | 7,875      | 126.65       | **5,017**       | **574**     |

**Key Observations:**

- mion.bun memory grows linearly throughout the test (2154 → 5017 MB)
- Other frameworks maintain stable memory (~51-71 MB)
- mion.bun CPU usage is 5x higher than competitors

## Architecture Comparison

### How Hono Uses Bun

```mermaid
flowchart LR
    A[Bun.serve] --> B[app.fetch]
    B --> C[dispatch]
    C --> D[matchRoute]
    D --> E[handler]
    E --> F[Response]
```

**Key characteristics:**

1. **Direct export pattern**: Hono exports the app directly, Bun auto-detects the `fetch` method
2. **Synchronous path matching**: Uses in-memory router with no async overhead
3. **Minimal object creation**: Reuses context objects where possible
4. **No body pre-parsing**: Body is parsed lazily only when needed via `c.req.json()`

### How Elysia Uses Bun

```mermaid
flowchart LR
    A[Bun.serve] --> B[compiled fetch]
    B --> C[static router check]
    C --> D[dynamic router]
    D --> E[handler]
    E --> F[Response]
```

**Key characteristics:**

1. **AOT compilation**: Pre-compiles route handlers for maximum performance
2. **Static router optimization**: Generates switch statements for static routes
3. **Lazy body parsing**: Uses `await c.req.json()` only when needed
4. **Calls `Bun.gc(false)`**: Explicitly triggers garbage collection after module loading

### How Mion Uses Bun

```mermaid
flowchart LR
    A[Bun.serve] --> B[fetch handler]
    B --> C[new URL - path extraction]
    C --> D[await req.text - body read]
    D --> E[new Headers]
    E --> F[dispatchRoute]
    F --> G[reply]
    G --> H[new TextEncoder.encode]
    H --> I[new Response]
```

**Key characteristics:**

1. **Eager body reading**: Always reads body with `await req.text()` before routing
2. **URL parsing per request**: Creates `new URL(req.url)` for every request
3. **Headers object creation**: Creates `new Headers(defaultHeaders)` per request
4. **TextEncoder usage**: Encodes response body to buffer for every JSON response
5. **No AOT/caching**: No pre-compilation or route caching visible in wrapper

## Identified Performance Issues

### 1. Body Parsing Strategy: `req.json()` vs `req.text()` - HIGH IMPACT

**Location**: [`bunHttp.ts:61`](node_modules/@mionkit/bun/src/bunHttp.ts:61)

```typescript
const rawBody = req.body ? (isBinary ? await req.arrayBuffer() : await req.text()) : '';
```

**Context**: Since mion uses RPC-style calls where all data is sent in the body (no query params), eager body reading is appropriate for mion's architecture. However, the choice between `req.text()` and `req.json()` has significant performance implications.

#### Why `req.json()` is Better Than `req.text()` + `JSON.parse()`

| Aspect              | `req.text()` + `JSON.parse()`   | `req.json()`                      |
| ------------------- | ------------------------------- | --------------------------------- |
| Memory allocations  | 2 (string + parsed object)      | 1 (parsed object only)            |
| Native optimization | No                              | Yes - Bun uses native JSON parser |
| String intermediate | Yes - full body as UTF-8 string | No - parses directly from buffer  |
| GC pressure         | Higher                          | Lower                             |

**How Bun's `req.json()` works internally**:

- Uses Bun's native JSON parser written in Zig (not V8's `JSON.parse`)
- Parses directly from the request's internal buffer
- Avoids creating an intermediate JavaScript string
- Significantly faster and more memory-efficient

**Memory impact example** (100-byte JSON body, 10,000 requests):

- `req.text()` approach: ~2MB string allocations + ~2MB parsed objects = ~4MB
- `req.json()` approach: ~2MB parsed objects only = ~2MB
- **50% memory reduction** just from this change

**Recommendation**: If the router can accept a pre-parsed JSON object:

```typescript
// Current (suboptimal)
const rawBody = req.body ? await req.text() : '';
// Later in router: JSON.parse(rawBody)

// Proposed (optimal)
const parsedBody = req.body ? await req.json() : null;
// Router receives already-parsed object
```

**Note**: This requires the router's `dispatchRoute` to accept a parsed object instead of a raw string. If the router must receive a string for custom parsing/validation logic, then `req.text()` is unavoidable, but consider if that architecture can be changed.

### 2. URL Parsing Per Request - HIGH

**Location**: [`bunHttp.ts:57`](node_modules/@mionkit/bun/src/bunHttp.ts:57)

```typescript
const path = new URL(req.url).pathname;
```

**Problem**: Creates a new URL object for every request just to extract the pathname.

**Better approach**: Use string manipulation or Bun's optimized path extraction:

```typescript
// Option 1: String manipulation
const url = req.url;
const pathStart = url.indexOf('/', 8); // Skip "http://" or "https://"
const pathEnd = url.indexOf('?', pathStart);
const path = pathEnd === -1 ? url.slice(pathStart) : url.slice(pathStart, pathEnd);

// Option 2: Use Bun's request.path if available
const path = req.path; // Bun-specific optimization
```

### 3. Headers Object Creation Per Request - MEDIUM

**Location**: [`bunHttp.ts:62`](node_modules/@mionkit/bun/src/bunHttp.ts:62)

```typescript
const responseHeaders = new Headers(defaultHeaders);
```

**Problem**: Creates a new Headers object from an array for every request.

**Better approach**:

- Use a plain object and convert to Headers only when creating Response
- Or reuse a template Headers object and clone it

### 4. TextEncoder Per Response - MEDIUM

**Location**: [`bunHttp.ts:123`](node_modules/@mionkit/bun/src/bunHttp.ts:123)

```typescript
const buffer = textEncoder.encode(mionResp.rawBody as string);
```

**Problem**: While the TextEncoder is reused (good), encoding happens for every response.

**Better approach**:

- Use `Response.json()` for JSON responses (Bun optimizes this internally)
- Let Bun handle content-length calculation

### 5. Missing Garbage Collection Hint - LOW

**Problem**: Unlike Elysia which calls `Bun.gc(false)` after initialization, mion doesn't hint to Bun's GC.

### 6. Potential Memory Leak in dispatchRoute - CRITICAL

The memory growth pattern (linear increase from 2154 → 5017 MB) suggests a **memory leak** rather than just inefficient allocation. This is likely in the `dispatchRoute` function from `@mionkit/router`, not in the Bun wrapper itself.

**Possible causes:**

- Context objects not being released
- Caching/memoization without bounds
- Event listeners or callbacks accumulating
- Closures holding references to request data

## Recommendations

### Immediate Fixes - Bun Wrapper

#### 1. Use Native `req.json()` Instead of `req.text()`

```typescript
async fetch(req) {
    const path = extractPath(req.url);
    const contentType = req.headers.get('content-type') || '';
    const isBinary = contentType.includes('application/octet-stream');

    // Use Bun's native JSON parser - avoids intermediate string allocation
    const rawBody = req.body
        ? (isBinary ? await req.arrayBuffer() : await req.json())
        : null;

    const responseHeaders = new Headers(defaultHeaders);

    // Router receives pre-parsed JSON object
    return dispatchRoute(path, rawBody, req.headers, responseHeaders, req, undefined)
        .then((routeResp) => reply(routeResp, responseHeaders))
        .catch((e) => handleError(e, responseHeaders));
}
```

**Benefits**:

- Bun's native Zig-based JSON parser is faster than V8's `JSON.parse()`
- Avoids creating intermediate JavaScript string (50% less memory allocation)
- Reduces GC pressure significantly

**Note**: This requires updating `dispatchRoute` to accept a pre-parsed object instead of a raw string.

#### 2. Optimized Path Extraction

```typescript
function extractPath(url: string): string {
  const pathStart = url.indexOf('/', 8);
  const queryStart = url.indexOf('?', pathStart);
  return queryStart === -1 ? url.slice(pathStart) : url.slice(pathStart, queryStart);
}
```

#### 3. Use Response.json for JSON Responses

```typescript
case SerializerModes.stringifyJson: {
    // Let Bun handle JSON serialization and content-length
    return new Response(mionResp.rawBody, {
        status: mionResp.statusCode,
        headers: responseHeaders,
    });
}
```

#### 4. Add GC Hint After Initialization

```typescript
export async function startBunServer(options?: Partial<BunHttpOptions>): Promise<Server<any>> {
  // ... existing code ...

  // Hint to Bun's GC after initialization
  if (typeof Bun !== 'undefined' && Bun.gc) {
    Bun.gc(false);
  }

  return server;
}
```

### Investigation Required - Router Layer

The memory leak pattern strongly suggests issues in the router layer. Investigate:

1. **Context object lifecycle**: Are contexts being pooled/reused or created fresh?
2. **Route caching**: Is there unbounded caching of route matches?
3. **Validation caching**: Are validation results being cached without limits?
4. **Serialization buffers**: Are binary serializers properly releasing buffers?

### Suggested Profiling Steps

1. **Heap snapshot comparison**: Take heap snapshots at start and after 1000 requests
2. **Allocation tracking**: Use Bun's built-in profiler to track allocations
3. **Isolate the leak**: Run mion.bun without the router to see if wrapper alone leaks

## Implementation Plan

### Phase 1: Quick Wins - Bun Wrapper Optimizations

- [ ] Use native `req.json()` instead of `req.text()` + `JSON.parse()` (requires router changes)
- [ ] Optimize path extraction (string manipulation instead of `new URL()`)
- [ ] Use `Response.json()` for JSON responses
- [ ] Add `Bun.gc(false)` hint after initialization

### Phase 2: Memory Leak Investigation

- [ ] Profile dispatchRoute function
- [ ] Check context object lifecycle
- [ ] Review caching mechanisms
- [ ] Test with memory profiler

### Phase 3: Architecture Improvements

- [ ] Consider AOT compilation like Elysia
- [ ] Implement request/response object pooling
- [ ] Add static route optimization

## Appendix: Code Comparison

### Hono Fetch Handler

```javascript
// Minimal, synchronous where possible
this.fetch = (request, Env, executionCtx) => {
  return this.dispatch(request, executionCtx, Env, request.method);
};
```

### Elysia Fetch Handler

```javascript
// AOT compiled, static router optimization
fetch = (e) => (this.fetch = this.config.aot ? a(this) : b(this))(e);
```

### Mion Fetch Handler

```typescript
// Current implementation - multiple allocations per request
async fetch(req) {
    const path = new URL(req.url).pathname;
    const contentType = req.headers.get('content-type') || '';
    const isBinary = contentType.includes('application/octet-stream');
    const rawBody = req.body ? (isBinary ? await req.arrayBuffer() : await req.text()) : '';
    const responseHeaders = new Headers(defaultHeaders);
    // ...
}
```
