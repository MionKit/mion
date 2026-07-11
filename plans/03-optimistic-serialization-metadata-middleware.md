# Plan: Optimistic Serialization Mode & Metadata Middleware

## Context

Currently, the mion client must make a **separate HTTP call** to fetch methods metadata (JIT functions, type info) before it can serialize/deserialize any route request. This adds latency on the first call to any new route.

**Goal**: Enable a single-request flow where the client sends an "optimistic" request (plain JSON, no JIT needed) and receives both the route response AND the metadata in the same response. This eliminates the extra round-trip.

Two interdependent changes:
1. **Router**: Convert `methodsMetadataById` to a middleware so metadata can be returned alongside any route response
2. **Client**: Add `optimistic` serializer mode that sends plain JSON and extracts metadata from the response

---

## Part 1: Core Type Changes

### 1.1 Add `optimistic` to `SerializerModes`

**File**: [general.types.ts](packages/core/src/types/general.types.ts#L16-L23)

```typescript
export const SerializerModes = {
    json: 1,
    binary: 2,
    stringifyJson: 3,
    optimistic: 4,
} as const;
```

This makes `'optimistic'` a valid `SerializerMode`. It's CLIENT-ONLY — the server never uses `optimistic` as its own serializer.

### 1.2 Add `methodsMetadata` to `MION_ROUTES`

**File**: [constants.ts](packages/core/src/constants.ts#L24-L40)

```typescript
export const MION_ROUTES = {
    methodsMetadataById: 'mion@methodsMetadataById',
    methodsMetadata: 'mion@methodsMetadata', // NEW - middleware ID
    // ... rest unchanged
} as const;
```

The new constant is the middleware ID. The old `methodsMetadataById` is kept for the standalone route (backward compat / AOT).

---

## Part 2: Router — Metadata Middleware

### 2.1 Create the metadata middleware handler

**File**: [client.routes.ts](packages/router/src/routes/client.routes.ts)

Add a thin wrapper around the existing `mionGetRemoteMethodsDataById` handler — no logic duplication:

```typescript
/** Middleware wrapper: delegates to mionGetRemoteMethodsDataById when params are provided */
function mionMethodsMetadata(
    ctx: CallContext,
    methodsIds?: string[],
    getAllRemoteMethods?: boolean
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> | void {
    if (!methodsIds || methodsIds.length === 0) return; // no metadata requested, noop

    // Force JSON serialization so optimistic client can parse the response
    (ctx.response as Mutable<MionResponse>).serializer = SerializerModes.stringifyJson;

    // Delegate to existing handler
    return mionGetRemoteMethodsDataById(ctx, methodsIds, getAllRemoteMethods);
}
```

Key behaviors:
- **Optional params**: When the client doesn't include `mion@methodsMetadata` in the body, `methodsIds` is `undefined` → returns `void` (noop)
- **When called with params**: Returns `SerializableMethodsData` and forces response serializer to `stringifyJson`
- **`runOnError: true`**: Always runs, even after route validation/serialization errors

Export the middleware definition:

```typescript
export const mionClientMiddleFns = {
    [MION_ROUTES.methodsMetadata]: middleFn(mionMethodsMetadata, {runOnError: true}),
} as const satisfies MiddleFnsCollection;
```

### 2.2 Remove `methodsMetadataByPath` route

**File**: [client.routes.ts](packages/router/src/routes/client.routes.ts#L112-L117)

Remove `methodsMetadataByPath` from `mionClientRoutes`. Keep only `methodsMetadataById`:

```typescript
export const mionClientRoutes = {
    [MION_ROUTES.methodsMetadataById]: route(mionGetRemoteMethodsDataById, {serializer: 'stringifyJson'}),
} as const satisfies Routes;
```

Remove the `mionGetRemoteMethodsDataByPath` function.

### 2.3 Register metadata middleware as global endMiddleFn

**File**: [router.ts](packages/router/src/router.ts#L73-L83)

Import and add the middleware BEFORE the serializer in `defaultEndMiddleFns`:

```typescript
import {mionClientMiddleFns} from './routes/client.routes.ts';

const defaultEndMiddleFns = {
    ...mionClientMiddleFns,  // mion@methodsMetadata — runs before serializer
    mionSerializeResponse: serializerMiddleFns.mionSerializeResponse,
};
```

This ensures the metadata middleware is part of **every** route's execution chain. Its position before the serializer means:
1. Metadata middleware runs → writes result to `response.body['mion@methodsMetadata']`, overrides serializer to `stringifyJson` if metadata was requested
2. Serializer runs → serializes all response data (including metadata) as JSON

### 2.4 Handle `optimistic` in `getSerializerCodeFromMode`

**File**: [router.ts](packages/router/src/router.ts) — `getSerializerCodeFromMode` function

Add a fallback for `optimistic` on the server side (safety measure):

```typescript
case 'optimistic':
    return SerializerModes.stringifyJson; // server treats optimistic as stringifyJson
```

### 2.5 Update `mionInternalRoutes` filtering

**File**: [client.routes.ts](packages/router/src/routes/client.routes.ts#L33) and [router.ts](packages/router/src/router.ts#L60)

Both derive from `Object.values(MION_ROUTES)`, so the new `methodsMetadata` constant is automatically included in the internal routes filter. The metadata middleware will NOT appear in client-facing metadata (correct behavior — clients interact with it directly by including params in the body).

### 2.6 Remove `methodsMetadataByPath` from MION_ROUTES

**File**: [constants.ts](packages/core/src/constants.ts#L24-L40)

Remove the `methodsMetadataByPath` entry:

```typescript
export const MION_ROUTES = {
    methodsMetadataById: 'mion@methodsMetadataById',
    methodsMetadata: 'mion@methodsMetadata',
    platformError: 'mion@platformError',
    notFound: 'mion@notFound',
    thrownErrors: '@thrownErrors',
} as const;
```

**Breaking change**: Any code referencing `MION_ROUTES.methodsMetadataByPath` must be updated.

---

## Part 3: Client — Optimistic Serializer Mode

### 3.1 Overview of the optimistic client flow

```
First call (no metadata cached):
  1. Build request body: { "getUser": [userId], "mion@methodsMetadata": [["getUser"], true] }
  2. Try to serialize with plain JSON.stringify (no JIT needed)
     2a. If JSON.stringify FAILS (e.g. circular refs, BigInt, etc):
         → fall back to fetchRemoteMethodsMetadata (standalone route call)
         → then callStandard() with proper JIT serialization
  3. POST to route URL
  4. Parse response as JSON
  5. Extract "mion@methodsMetadata" from response → cache JIT functions & metadata
  6. Use now-available JIT functions to deserialize other method return values
  7. If route response contains serialization or validation errors:
     → metadata is now cached from step 5
     → retry with callStandard() (proper JIT serialization/deserialization)

Subsequent calls (metadata cached):
  1. Use standard flow (JIT serialization, no metadata middleware params in body)
```

### 3.2 Add optimistic serialization

**File**: [serializer.ts](packages/client/src/lib/serializer.ts)

Add optimistic case to `serializeRequestBody`:

```typescript
case 'optimistic':
    return {
        body: serializeRequestBodyOptimistic(req),
        contentType: 'application/json; charset=utf-8',
    };
```

New function — plain JSON.stringify without JIT:

```typescript
export function serializeRequestBodyOptimistic(req: MionClientRequest<any, any>): string {
    const body: Record<string, any> = {};
    const subRequestIds = Object.keys(req.subRequestList);
    for (const id of subRequestIds) {
        const subRequest = req.subRequestList[id];
        if (!subRequest) continue;
        body[id] = subRequest.params;
    }
    return JSON.stringify(body);
}
```

Update `getSerializerMode` to handle optimistic:

```typescript
function getSerializerMode(req: MionClientRequest<any, any>): SerializerMode {
    if (req.options.serializer === 'optimistic') return 'optimistic';
    // ... existing logic
}
```

### 3.3 Add optimistic deserialization

**File**: [serializer.ts](packages/client/src/lib/serializer.ts)

Two-phase approach:
1. Parse the JSON response and extract/process the metadata entry first (it's inherently JSON-safe)
2. Cache the metadata (JIT functions now available)
3. Deserialize the rest of the body using the **standard** `deserializeResponseBody` path (not optimistically — JIT is now loaded)

```typescript
export async function deserializeOptimisticResponseBody(response: Response): Promise<ResponseBody> {
    const rawBody = await deserializeJsonResponseBody(response);

    // ── Phase 1: Extract & process metadata FIRST (JSON-safe, no JIT needed) ──
    const metadata = rawBody[MION_ROUTES.methodsMetadata] as SerializableMethodsData | undefined;
    delete rawBody[MION_ROUTES.methodsMetadata];

    if (metadata) {
        // Cache metadata → JIT functions are now available for the rest of the body
        processOptimisticMetadata(metadata, options);
    }

    // ── Phase 2: Deserialize the rest of the body using standard (non-optimistic) path ──
    // At this point JIT functions are loaded, so we use the regular deserialization
    // which calls routesCache.useMethodJitFns() and parseHandlerReturnValue() per method.

    // Handle thrownErrors (same as standard deserializeResponseBody)
    if (MION_ROUTES.thrownErrors in rawBody) {
        const unexpectedErrors = rawBody[MION_ROUTES.thrownErrors];
        if (MION_ROUTES.platformError in unexpectedErrors) {
            const globalErrorValue = unexpectedErrors[MION_ROUTES.platformError];
            const platformError = isRpcError(globalErrorValue) ? new RpcError(globalErrorValue) : globalErrorValue;
            return {[MION_ROUTES.platformError]: platformError};
        }
        Object.assign(rawBody, unexpectedErrors);
        delete rawBody[MION_ROUTES.thrownErrors];
    }

    // Deserialize each method's return value using JIT (standard path)
    const deserializedBody: ResponseBody = {};
    Object.entries(rawBody).forEach(([methodId, returnValue]) => {
        const method = routesCache.useMethodJitFns(methodId);
        deserializedBody[methodId] = parseHandlerReturnValue(method, returnValue);
    });
    return deserializedBody;
}
```

This means the optimistic response is fully deserialized using the same JIT functions as a normal response — the only difference is that metadata was extracted and cached first from the same response body.

### 3.4 Add metadata processing from optimistic response

**File**: [clientMethodsMetadata.ts](packages/client/src/lib/clientMethodsMetadata.ts)

New exported function (reuses existing `storeDependencies`, `storeMethodsMetadata`, `addToCaches`):

```typescript
export function processOptimisticMetadata(
    serializableMethodsData: SerializableMethodsData,
    options: ClientOptions
): void {
    storeDependencies(serializableMethodsData.deps, serializableMethodsData.purFnDeps, options);
    storeMethodsMetadata(serializableMethodsData.methods, options);
    addToCaches(serializableMethodsData);
}
```

### 3.5 Make `fetchRemoteMethodsMetadata` optimistic

**File**: [clientMethodsMetadata.ts](packages/client/src/lib/clientMethodsMetadata.ts#L33-L71)

Currently `fetchRemoteMethodsMetadata` uses `deserializeResponseBody` to parse the response from `methodsMetadataById`. This requires JIT metadata for `methodsMetadataById` itself to be loaded (via AOT caches), creating a circular dependency.

Since `methodsMetadataById` params are plain JSON types (`string[]`, `boolean`) and its response (`SerializableMethodsData`) is inherently JSON-safe (it's metadata/code strings), the entire call can be optimistic — no JIT needed in either direction.

**Changes:**
- Replace `deserializeResponseBody(response)` with plain `response.json()`
- Extract `serializableMethodsData` directly from the parsed JSON
- Remove dependency on `validateClientCaches()` (no longer needed — metadata route doesn't require AOT)

```typescript
export async function fetchRemoteMethodsMetadata(methodIds: string[], options: ClientOptions) {
    loadAOTCaches();
    // validateClientCaches() no longer needed — metadata fetch is optimistic
    restoreFromLocalStorage(methodIds, options);
    const missingAfterLocal = methodIds.filter((path) => !routesCache.hasMetadata(path));
    if (!missingAfterLocal.length) return;
    const shouldReturnAllMethods = true;
    const body: RequestBody = {
        [MION_ROUTES.methodsMetadataById]: [missingAfterLocal, shouldReturnAllMethods],
    };
    try {
        const path = getRoutePath([MION_ROUTES.methodsMetadataById], options);
        const url = new URL(path, options.baseURL);
        const response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body), // already plain JSON — no JIT needed
        });

        // Parse response as plain JSON — no JIT deserialization needed
        // SerializableMethodsData is inherently JSON-safe (metadata, code strings, hashes)
        const parsedBody = await response.json();

        // Handle platform/thrown errors
        if (MION_ROUTES.thrownErrors in parsedBody) {
            const unexpectedErrors = parsedBody[MION_ROUTES.thrownErrors];
            if (MION_ROUTES.platformError in unexpectedErrors) {
                throw unexpectedErrors[MION_ROUTES.platformError];
            }
            Object.assign(parsedBody, unexpectedErrors);
            delete parsedBody[MION_ROUTES.thrownErrors];
        }
        if (isRpcError(parsedBody[MION_ROUTES.platformError])) throw parsedBody[MION_ROUTES.platformError];

        const serializableMethodsData = parsedBody[MION_ROUTES.methodsMetadataById] as MethodsMetadataResponse;
        if (isRpcError(serializableMethodsData)) throw serializableMethodsData;
        if (!serializableMethodsData)
            throw new RpcError({
                type: 'cant-fetch-remote-methods-metadata',
                publicMessage: 'Failed to fetch remote methods metadata',
                errorData: {response},
            });

        storeDependencies(serializableMethodsData.deps, serializableMethodsData.purFnDeps, options);
        storeMethodsMetadata(serializableMethodsData.methods, options);
        addToCaches(serializableMethodsData);
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}
```

This eliminates the need for AOT caches to contain `methodsMetadataById` metadata just to bootstrap the metadata fetch. The `validateClientCaches` function can be removed or made optional.

### 3.6 Implement `callOptimistic()` in MionClientRequest

**File**: [request.ts](packages/client/src/request.ts)

Add new method to `MionClientRequest`:

```typescript
private async callOptimistic(): Promise<ResponseBody> {
    const errors: RequestErrors = new Map();

    // Check if metadata is already cached → use standard flow
    const subRequestIds = Object.keys(this.subRequestList);
    const allCached = subRequestIds.every(id => routesCache.hasMetadata(id));
    if (allCached) return this.callStandard();

    // Add metadata middleware params to request
    const metadataSubRequest: SubRequest<any> = {
        pointer: [MION_ROUTES.methodsMetadata],
        id: MION_ROUTES.methodsMetadata,
        isResolved: false,
        params: [subRequestIds, true], // [methodsIds, getAllRemoteMethods]
    };
    this.addSubRequest(metadataSubRequest);

    // Try to serialize as plain JSON — if it fails, fall back to standard flow
    let serialized: string;
    try {
        serialized = serializeRequestBodyOptimistic(this);
    } catch (error: any) {
        // JSON.stringify failed (circular refs, BigInt, unsupported types, etc.)
        // Fall back: fetch metadata optimistically via standalone route, then standard request
        delete this.subRequestList[MION_ROUTES.methodsMetadata];
        await fetchRemoteMethodsMetadata(Object.keys(this.subRequestList), this.options);
        return this.callStandard();
    }

    try {
        const url = new URL(this.path, this.options.baseURL);
        const fetchOptions: RequestInit = {
            ...this.options.fetchOptions,
            method: 'POST',
            headers: {
                ...this.options.fetchOptions.headers,
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: serialized,
        };
        this.response = await fetch(url, fetchOptions);
    } catch (error: any) {
        this.onError(error, 'Error executing optimistic request', errors);
        return Promise.reject(errors);
    }

    try {
        // deserializeOptimisticResponseBody handles everything:
        //   1. Extracts & caches metadata (JIT functions become available)
        //   2. Deserializes the rest of the body using standard JIT path
        const deserialized = await deserializeOptimisticResponseBody(this.response, this.options);

        // Handle platform errors
        if (MION_ROUTES.platformError in deserialized) {
            const platformError = deserialized[MION_ROUTES.platformError];
            Object.entries(this.subRequestList).forEach(([id, methodMeta]) => {
                methodMeta.isResolved = true;
                methodMeta.error = platformError as RpcError<string>;
                errors.set(id, platformError as RpcError<string>);
            });
            return Promise.reject(errors);
        }

        // Check for serialization/validation errors → retry with proper serialization
        const needsRetry = this.shouldRetryWithProperSerialization(deserialized);
        if (needsRetry) {
            return this.retryWithProperSerialization();
        }

        // Process response values (same as standard flow)
        Object.entries(this.subRequestList).forEach(([id, methodMeta]) => {
            if (id === MION_ROUTES.methodsMetadata) return; // skip metadata middleware
            const resp = this.getResponseValueFromBodyOrHeader(id, deserialized, (this.response as Response).headers);
            methodMeta.isResolved = true;
            if (isRpcError(resp)) {
                methodMeta.error = resp;
                errors.set(id, resp);
            } else {
                methodMeta.resolvedValue = resp;
            }
        });

        // Collect errors from non-subrequest methods
        Object.entries(deserialized).forEach(([id, value]) => {
            if (!(id in this.subRequestList) && isRpcError(value)) {
                errors.set(id, value);
            }
        });

        if (errors.size) return Promise.reject(errors);
        return deserialized;
    } catch (error) {
        this.onError(error, 'Error parsing optimistic response', errors);
        return Promise.reject(errors);
    }
}
```

### 3.7 Update `call()` to dispatch to optimistic

**File**: [request.ts](packages/client/src/request.ts#L48-L147)

```typescript
async call(): Promise<ResponseBody> {
    if (this.options.serializer === 'optimistic') {
        return this.callOptimistic();
    }
    return this.callStandard();
}
```

Extract existing `call()` logic into a new `private async callStandard()` method.

### 3.8 Add retry logic

**File**: [request.ts](packages/client/src/request.ts)

```typescript
private shouldRetryWithProperSerialization(deserialized: ResponseBody): boolean {
    return Object.values(deserialized).some(value =>
        isRpcError(value) && (
            value.type === 'serialization-error' ||
            value.type === 'validation-error' ||
            value.type === 'parsing-json-request-error'
        )
    );
}

private async retryWithProperSerialization(): Promise<ResponseBody> {
    // Reset subrequests for retry (remove metadata middleware subrequest)
    delete this.subRequestList[MION_ROUTES.methodsMetadata];
    Object.values(this.subRequestList).forEach(sr => {
        sr.isResolved = false;
        sr.resolvedValue = undefined;
        sr.error = undefined;
    });

    // Metadata is now cached → use standard flow (proper JIT serialization/deserialization)
    return this.callStandard();
}
```

### 3.9 Skip `validateClientCaches` for optimistic

**File**: [clientMethodsMetadata.ts](packages/client/src/lib/clientMethodsMetadata.ts#L206-L218)

`validateClientCaches` is called inside `fetchRemoteMethodsMetadata`, which is skipped in optimistic mode. No changes needed — the function is never reached in the optimistic path.

### 3.10 Handle headersFn middleware in optimistic mode

`headersFn` middleware requires metadata to know which params go in headers vs body. In optimistic mode (first call), metadata is not available, so:
- Headers params are sent in the JSON body instead of HTTP headers
- The server may throw a validation error (missing headers)
- The metadata is still returned (middleware with `runOnError: true`)
- The retry uses proper header extraction (metadata now cached)

No special code needed — the existing retry mechanism handles this naturally.

---

## Part 4: Edge Cases

### 4.1 RoutesFlow with optimistic mode
The metadata middleware is in every execution chain, including merged routesFlow chains. The client includes `mion@methodsMetadata` in the body with ALL route IDs from the flow. Works naturally.

### 4.2 AOT mode
In AOT mode, all metadata is pre-compiled and bundled. The client already has metadata at load time. When `options.serializer === 'optimistic'`, `callOptimistic()` detects all metadata is cached and falls through to `callStandard()`. No overhead.

### 4.3 GET queries in optimistic mode
`isQueryRoute()` requires metadata to check `isMutation === false`. In optimistic mode (first call), metadata is not available → always uses POST. After metadata is cached, subsequent calls can use GET for query routes.

### 4.4 Binary routes with optimistic mode
When the metadata middleware runs and has params, it forces `response.serializer = SerializerModes.stringifyJson`. This overrides any route-level binary serializer, ensuring the response is always JSON when metadata is requested. After metadata is cached, subsequent calls use the route's configured serializer (binary if configured).

---

## Critical Files to Modify

| File | Change |
|------|--------|
| [packages/core/src/types/general.types.ts](packages/core/src/types/general.types.ts) | Add `optimistic: 4` to `SerializerModes` |
| [packages/core/src/constants.ts](packages/core/src/constants.ts) | Add `methodsMetadata` to `MION_ROUTES`, remove `methodsMetadataByPath` |
| [packages/router/src/routes/client.routes.ts](packages/router/src/routes/client.routes.ts) | Add metadata middleware handler, export `mionClientMiddleFns`, remove `methodsMetadataByPath` route and handler |
| [packages/router/src/router.ts](packages/router/src/router.ts) | Register metadata middleware in `defaultEndMiddleFns`, handle `'optimistic'` in `getSerializerCodeFromMode` |
| [packages/client/src/lib/serializer.ts](packages/client/src/lib/serializer.ts) | Add `serializeRequestBodyOptimistic`, `deserializeOptimisticResponseBody` (extracts metadata first, then standard JIT deserialization), update `getSerializerMode` and `serializeRequestBody` switch |
| [packages/client/src/lib/clientMethodsMetadata.ts](packages/client/src/lib/clientMethodsMetadata.ts) | Add `processOptimisticMetadata` |
| [packages/client/src/request.ts](packages/client/src/request.ts) | Add `callOptimistic`, `callStandard`, `retryWithProperSerialization`, `shouldRetryWithProperSerialization`, update `call()` |

### Files that may need updates (search for `methodsMetadataByPath` references)

| File | Change |
|------|--------|
| Any file referencing `MION_ROUTES.methodsMetadataByPath` | Remove/update references |
| [packages/client/src/aot/aotCaches.ts](packages/client/src/aot/aotCaches.ts) | May need update if it references `methodsMetadataByPath` |
| [packages/router/src/lib/remoteMethods.ts](packages/router/src/lib/remoteMethods.ts) | Check for `methodsMetadataByPath` references |
| Test files in `packages/router/` and `packages/client/` | Update/add tests |

### Existing functions to reuse

| Function | File | Usage |
|----------|------|-------|
| `mionGetRemoteMethodsDataById` | [client.routes.ts:40](packages/router/src/routes/client.routes.ts#L40) | Middleware wrapper delegates directly to this existing handler |
| `storeDependencies` | [clientMethodsMetadata.ts:86](packages/client/src/lib/clientMethodsMetadata.ts#L86) | Reuse in `processOptimisticMetadata` |
| `storeMethodsMetadata` | [clientMethodsMetadata.ts:110](packages/client/src/lib/clientMethodsMetadata.ts#L110) | Reuse in `processOptimisticMetadata` |
| `addToCaches` | [clientMethodsMetadata.ts:199](packages/client/src/lib/clientMethodsMetadata.ts#L199) | Reuse in `processOptimisticMetadata` |
| `deserializeJsonResponseBody` | [serializer.ts:132](packages/client/src/lib/serializer.ts#L132) | Reuse in `deserializeOptimisticResponseBody` (phase 1: JSON parse) |
| `parseHandlerReturnValue` | [serializer.ts:195](packages/client/src/lib/serializer.ts#L195) | Reuse in `deserializeOptimisticResponseBody` (phase 2: standard JIT deserialization) |

---

## Verification

### Router-side tests
1. When request body contains `mion@methodsMetadata` with method IDs → response includes metadata
2. When request body does NOT contain `mion@methodsMetadata` → no metadata in response (noop)
3. When route handler throws an error → metadata is still returned (`runOnError: true`)
4. Metadata includes all public methods in the execution chain (excluding internal mion routes)
5. Response serializer is forced to `stringifyJson` when metadata is requested (even for binary routes)
6. `methodsMetadataById` standalone route still works (backward compat)

### Client-side tests
1. **Simple types**: optimistic call succeeds in one round-trip (string, number, boolean params/return)
2. **Complex types**: optimistic call triggers retry, second call succeeds (Date, Map, Set params)
3. **Metadata caching**: after first optimistic call, subsequent calls use standard flow
4. **Binary routes**: optimistic forces JSON, retry uses proper binary serialization
5. **RoutesFlow**: optimistic works with multiple routes in single request
6. **Error handling**: platform errors, validation errors, serialization errors properly handled
7. **AOT mode**: optimistic detects cached metadata and uses standard flow immediately

### Integration tests
```bash
# Run router tests
npx vitest run --project router

# Run client tests
npx vitest run --project client

# Run all tests
npm run test
```

### Manual testing
1. Start test server with a route using simple types → optimistic call should work in one round-trip
2. Start test server with a route using Date/complex types → optimistic call should retry and succeed
3. Start test server with binary serializer → optimistic forces JSON, retry uses binary
