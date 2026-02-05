# Binary Serialization Implementation Plan

## Overview

This document outlines the implementation plan for fully supporting binary serialization in mion's router and client packages. The run-types package already provides `toBinary` and `fromBinary` JIT functions, and the infrastructure is partially in place but not fully connected.

## Architecture: Encoding/Decoding Configuration

### Key Design Principles

1. **Encoding/decoding is per-method metadata** - Not a global client setting
2. **Router config provides defaults** - Individual routes/hooks can override
3. **Client reads from metadata** - Uses encoding info from `MethodMetadata`
4. **Fallback to JSON** - If no metadata loaded, client uses `prepareForJson`/`restoreFromJson`

### Configuration Flow

```
RouterOptions (defaults)
       ↓
RemoteMethodOpts (per-route/hook override)
       ↓
MethodMetadata (shared with client)
       ↓
Client uses metadata.encoding
```

## Type Definitions

### Encoding Types (in `@mionkit/core`)

```typescript
// packages/core/src/types/method.types.ts

/** Encoding type for request/response body serialization */
export type SerializerMode = 'json' | 'binary' | 'stringifyJson';
export type DeserializerMode = 'json' | 'binary';
```

### Router Options

```typescript
// packages/router/src/types/general.ts

/** Global Router Options */
export interface RouterOptions<Req = any, ContextData extends Record<string, any> = any> extends CoreOptions {
  // ... existing options ...

  /**
   * Default encoding configuration for all routes/hooks.
   * Can be overridden per-route/hook.
   */
  serialize: SerializerMode;
  deserialize: DeserializerMode;

  // Remove these deprecated options:
  // useJitStringify: boolean;
  // useBinarySerialization: boolean;
}
```

### RemoteMethodOpts (per-route/hook)

```typescript
// packages/router/src/types/remoteMethods.ts

export interface RemoteMethodOpts {
  runOnError?: boolean;
  validateParams?: boolean;
  validateReturn?: boolean;
  description?: string;

  /**
   * Override encoding for this specific route/hook.
   * If not specified, uses router default encoding.
   */
  serialize: SerializerMode;
  deserialize: DeserializerMode;
}
```

### MethodMetadata (shared with client)

```typescript
// packages/core/src/types/method.types.ts

export interface MethodMetadata {
  // ... existing properties ...

  /** Encoding configuration for this method */
  serialize: SerializerMode;
  deserialize: DeserializerMode;
}
```

### Route/Hook Options

```typescript
// packages/router/src/types/remoteMethods.ts

export type RouteOptions = Partial<
  Pick<RouteMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'serialize' | 'deserialize'>
>;

export type HookOptions = Partial<
  Pick<HookMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError' | 'serialize' | 'deserialize'>
>;

export type HeaderHookOptions = Partial<
  Pick<HeaderMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError' | 'serialize' | 'deserialize'>
>;

// RawHookOptions doesn't need encoding - raw hooks handle their own serialization
export type RawHookOptions = Partial<Pick<RawMethod['options'], 'description' | 'runOnError'>>;
```

## Mapping to Body Types

| Serializer mode | Body Type | Content-Type                      |
| --------------- | --------- | --------------------------------- |
| `json`          | `1`       | `application/json; charset=utf-8` |
| `binary`        | `2`       | `application/octet-stream`        |
| `stringifyJson` | `3`       | `application/json; charset=utf-8` |

| Deserializer Mode mode | Body Type | Content-Type                      |
| ---------------------- | --------- | --------------------------------- |
| `json`                 | `1`       | `application/json; charset=utf-8` |
| `binary`               | `2`       | `application/octet-stream`        |

## Current State Analysis

### What's Already Implemented

1. **run-types package** (`@mionkit/run-types`):
   - `toBinary` and `fromBinary` JIT functions are fully implemented
   - `DataViewSerializer` and `DataViewDeserializer` classes in `@mionkit/core`
   - Binary serialization tests exist in `packages/run-types/src/jitCompilers/binary/binarySpec/`
   - JIT functions are compiled for each method's params and return types

2. **core package** (`@mionkit/core`):
   - `createDataViewSerializer()` and `createDataViewDeserializer()` functions
   - `DataViewSerializer` and `DataViewDeserializer` interfaces
   - `JitCompiledFunctions` includes `toBinary` and `fromBinary`

3. **router package** (`@mionkit/router`):
   - `RouterOptions.useBinarySerialization` option exists (to be replaced)
   - `MionRequest.binDeserializer` and `MionResponse.binSerializer` fields exist
   - `bodyType` supports 2 for binary
   - `dispatch.ts` creates `binDeserializer` when bodyType is 2
   - Platform adapters (http, bun, gcloud) have partial binary response handling

4. **Platform packages**:
   - `http`: Has binary response handling in `reply()` function
   - `bun`: Has binary response handling in `reply()` function
   - `gcloud`: Has binary response handling in `reply()` function
   - `aws`: Throws "Binary responses are not yet supported on AWS Lambda"

### What's Missing

1. **Router serializer** (`serializer.routes.ts`):
   - `deserializeRequestBody()` throws for binary
   - `serializeResponseBody()` throws for binary
   - Need to implement binary deserialization/serialization using JIT functions

2. **Router dispatch** (`dispatch.ts`):
   - `deserializeBodyParamsOrThrow()` uses `restoreFromJson`, needs binary path
   - Need to create `binSerializer` lazily when needed

3. **Platform packages**:
   - Need to handle binary request bodies (currently only handle string bodies)
   - AWS Lambda: Binary not supported - should throw clear error at startup

4. **Client package** (`@mionkit/client`):
   - `serializeRequestBody()` throws for binary
   - `deserializeResponseBody()` throws for binary
   - Need to read encoding from method metadata
   - Need to set correct `Content-Type` header based on encoding

## Implementation Plan

### Phase 1: Router Configuration Updates

- 1.1 Update `types/general.ts`

```typescript
import {EncodingOptions, DEFAULT_ENCODING} from '@mionkit/core';

export interface RouterOptions<Req = any, ContextData extends Record<string, any> = any> extends CoreOptions {
  /** ... existing options ... */

  /** Encoding configuration for this method */
  serialize: SerializerMode;
  deserialize: DeserializerMode;
}
```

- 1.2 Update `types/remoteMethods.ts`

```typescript
import {EncodingOptions} from '@mionkit/core';

export interface RemoteMethodOpts {
  /** ... existing options ... */

  /** Encoding configuration for this method */
  serialize: SerializerMode;
  deserialize: DeserializerMode;
}
```

- 1.3 Update Default Options

```typescript
const DEFAULT_ROUTER_OPTIONS: RouterOptions = {
  prefix: '',
  suffix: '',
  serialize: 'json';
  deserialize: 'json';
  // ... other defaults
};
```

- 1.4 Update Method Registration

When registering routes/hooks, merge encoding from route options with router defaults:

```typescript
// In reflection.ts or methodsCache.ts
function createMethodMetadata(handler: AnyHandler, routeOpts: RemoteMethodOpts, routerOpts: RouterOptions): MethodMetadata {
  // Merge encoding: route-specific overrides router default
  const serialize = routeOpts.serialize ?? routerOpts.serialize;
  const deserialize = routeOpts.deserialize ?? routerOpts.deserialize;

  return {
    // ... other fields
    serialize,
    deserialize,
  };
}
```

### Phase 2: Router Binary Serialization

- Update `dispatch.ts` - createCallContext
- Update `serializer.routes.ts`
- Update `dispatch.ts` - deserializeBodyParamsOrThrow

### Phase 3: Platform Package Updates

- Update HTTP Package (`mionHttp.ts`)
- Update Bun Package (`bunHttp.ts`)
- Update AWS Lambda Package (`awsLambda.ts`) - Binary NOT should throw if binary config is used
- update Google Cloud Functions (`googleCF.ts`)

### Phase 5: Client Package Updates

- Client Architecture

The client does NOT have its own encoding configuration. Instead:

1. **With metadata loaded**: Client reads `encoding` from `MethodMetadata`
2. **Without metadata**: Client defaults to `{ type: 'json', jsonMode: 'prepareForJson' }` for maximum compatibility

- Update client serializer `serializer.ts`
- Update client `request.ts`

### Phase 6: Binary Protocol Format

The binary protocol format for mion RPC:

#### Request Format

```
[4 bytes] - Number of methods (uint32 LE)
For each method:
  [4 bytes] - Method ID string length (uint32 LE)
  [N bytes] - Method ID string (UTF-8)
  [M bytes] - Serialized params (using toBinary JIT)
```

#### Response Format

```
[4 bytes] - Number of methods with return data (uint32 LE)
For each method:
  [4 bytes] - Method ID string length (uint32 LE)
  [N bytes] - Method ID string (UTF-8)
  [M bytes] - Serialized return value (using toBinary JIT)
```

### Phase 7: Testing

Create comprehensive tests in:

- `packages/router/src/routes/serializer.binary.spec.ts`
- `packages/client/src/serializer.binary.spec.ts`

Test scenarios:

1. Configuration validation (encoding options)
2. Per-route encoding override
3. Simple types (string, number, boolean)
4. Complex objects with nested structures
5. Arrays and tuples
6. Dates and BigInts
7. Error responses
8. Multiple methods in single request
9. HeadersHook with binary body
10. Thrown errors serialization
11. Round-trip consistency (client -> server -> client)
12. AWS Lambda binary rejection
13. Content-type mismatch errors
14. Client fallback when no metadata loaded

## Migration Guide

### Enabling Binary Encoding

**Server-side (global default):**

```typescript
import {initRouter} from '@mionkit/router';

initRouter(routes, {
  encoding: {type: 'binary'},
});
```

**Server-side (per-route):**

```typescript
const routes = {
  // This route uses binary encoding
  binaryRoute: route((ctx, data: ComplexData) => processData(data), {serialize: 'binary'}),

  // This route uses JSON (inherits from router default or explicit)
  jsonRoute: route((ctx, name: string) => `Hello ${name}`, {serialize: 'binary', deserialize: 'binary'}),
} satisfies Routes;
```

**Client-side:**

```typescript
import {initClient} from '@mionkit/client';

// Client automatically uses encoding from method metadata
// No encoding configuration needed!
const {client, routes} = initClient<RemoteApi>({
  baseURL: 'http://localhost:3000',
});

// If metadata is loaded, client uses the encoding specified by each route
// If no metadata, client falls back to JSON (prepareForJson)
```

### Using JSON with JIT Stringify (Recommended Default)

```typescript
// Server
initRouter(routes, {
  encoding: {type: 'json', jsonMode: 'stringifyJson'},
});

// Client - no configuration needed, reads from metadata
```

### Using PrepareForJson (Most Compatible)

```typescript
// Server
initRouter(routes, {
  encoding: {type: 'json', jsonMode: 'prepareForJson'},
});

// Client - no configuration needed, reads from metadata
// This is also the fallback when no metadata is loaded
```

### Platform Compatibility

| Platform               | Binary Support | Notes                                    |
| ---------------------- | -------------- | ---------------------------------------- |
| Node.js HTTP           | ✅ Yes         | Full support                             |
| Bun                    | ✅ Yes         | Full support                             |
| Google Cloud Functions | ✅ Yes         | Full support                             |
| AWS Lambda             | ❌ No          | Throws at config time if binary selected |

### Considerations

1. **Encoding Consistency**: All methods in a single request should use the same encoding
2. **Metadata Required for Binary**: Client needs metadata loaded to use binary encoding
3. **Fallback Behavior**: Without metadata, client uses JSON (prepareForJson) for compatibility
4. **Debugging**: Binary is harder to debug - use JSON during development
5. **Browser Support**: ArrayBuffer is well-supported in modern browsers
6. **Compression**: Binary may not compress as well as JSON with gzip
7. **AWS Lambda**: Binary not supported - will throw at configuration time

## Performance Expectations

Binary serialization should provide:

- Smaller payload sizes (especially for numeric data)
- Faster serialization/deserialization (no string parsing)
- Lower memory allocation (direct buffer operations)

Benchmarks should be added to validate these expectations.
