# Plan: Request Cancellation & Timeouts for `@mionjs/client`

## Context

The client library currently has no mechanism to cancel in-flight requests or enforce timeouts. This is a table-stakes feature for any production HTTP client — essential for SPA navigation (unmounting components mid-request), user-triggered cancels, and preventing hung requests. Both features share the same `AbortController` mechanism and naturally pair together.

## Design Decisions

1. **Per-request options via `CallOptions`**: A new `CallOptions` type with `signal?: AbortSignal` and `timeout?: number`. Passed as optional last parameter to `call()`, `callWithMiddleFns()`, `callWithWorkflow()`, and `routesFlow()`.

2. **Signal composition**: Use `AbortSignal.any([globalSignal, userSignal, AbortSignal.timeout(ms)])` to combine global abort, per-request signal, and timeout into one signal. Available in Node 20+ and all modern browsers.

3. **Global `client.abort()`**: A public method that aborts all in-flight requests via a global `AbortController` on `MionClient`. After aborting, immediately replaces with a fresh controller so subsequent requests work.

4. **Error distinction**: `AbortSignal.timeout()` throws `DOMException` with `name === 'TimeoutError'`; user/global abort throws `name === 'AbortError'`. The `onError()` handler inspects this to produce `RpcError` with type `'request-timeout'` or `'request-aborted'` respectively.

5. **Metadata fetch also respects signal**: `fetchRemoteMethodsMetadata()` receives the signal so cancellation is immediate even during the metadata-fetching phase.

6. **Retry survives signal**: The optimistic→proper retry in `makeCall()` inherits the signal from the instance field, no special handling needed.

## Files to Modify

| File | Changes |
|------|---------|
| `packages/client/src/types.ts` | Add `CallOptions` interface; add `timeout?` to `ClientOptions`; update `RouteSubRequest` method signatures |
| `packages/client/src/subRequest.ts` | Accept `CallOptions` in `call()`, `callWithMiddleFns()`, `callWithWorkflow()` and forward to client |
| `packages/client/src/client.ts` | Add `globalAbortController`, `composeSignal()`, `abort()` method; thread `CallOptions` through execute methods; pass signal to `MionClientRequest` |
| `packages/client/src/request.ts` | Accept `signal` in constructor; pass to `buildFetchOptions()` and `fetchRemoteMethodsMetadata()`; add signal to `RequestInit`; detect abort/timeout in `onError()` |
| `packages/client/src/lib/fetchRemoteMethodsMetadata.ts` | Accept optional `signal` param; pass to `fetch()` |
| `packages/client/src/routesFlow.ts` | Accept optional `CallOptions` as third param; forward to `executeCallWithWorkflow()` |
| `packages/client/src/client.spec.ts` | Add tests for cancellation, timeout, global abort, already-aborted signal |

## Implementation Steps

### Step 1: `types.ts` — Add `CallOptions` and update signatures

Add after `ClientOptions`:
```ts
/** Per-request options for call(), callWithMiddleFns(), callWithWorkflow() */
export interface CallOptions {
    /** AbortSignal to cancel this specific request */
    signal?: AbortSignal;
    /** Timeout in ms for this request (overrides ClientOptions.timeout) */
    timeout?: number;
}
```

Add `timeout?: number` to `ClientOptions` (optional, default undefined = no timeout).

Update `RouteSubRequest` interface method signatures:
- `call: (options?: CallOptions) => Promise<Result<...>>`
- `callWithMiddleFns: <H>(middleFns: H, options?: CallOptions) => Promise<...>`
- `callWithWorkflow: <...>(otherRoutes, middleFns?, options?: CallOptions) => Promise<...>`

### Step 2: `subRequest.ts` — Thread `CallOptions` through

Update `MionSubRequest` methods to accept and forward `CallOptions`:
- `call(options?)` → `this.client.executeCall(this, options)`
- `callWithMiddleFns(middleFns, options?)` → `this.client.executeCallWithMiddleFns(this, middleFns, options)`
- `callWithWorkflow(otherRoutes, middleFns?, options?)` → `this.client.executeCallWithWorkflow(allRoutes, middleFns, options)`

### Step 3: `client.ts` — Global abort controller + signal composition

Add to `MionClient`:
```ts
private globalAbortController = new AbortController();

abort(): void {
    this.globalAbortController.abort();
    this.globalAbortController = new AbortController();
}
```

Add private `composeSignal(callOptions?)`:
- Collects `[globalController.signal, callOptions.signal?, AbortSignal.timeout(timeout)?]`
- Returns `AbortSignal.any(signals)` if multiple, single signal if one, always includes global

Update `executeCall`, `executeCallWithMiddleFns`, `executeCallWithWorkflow` to accept `callOptions?: CallOptions` and forward to `executeRequest`.

In `executeRequest`: compose signal via `composeSignal()`, pass to `MionClientRequest` constructor.

Update `destroy()` to call `this.abort()` before clearing handlers.

### Step 4: `request.ts` — Pass signal to fetch

Add `signal?: AbortSignal` as last constructor parameter.

In `call()`: add `this.signal?.throwIfAborted()` as early check.

In `makeCall()`: pass `this.signal` to `fetchRemoteMethodsMetadata()` and `buildFetchOptions()`.

Update `buildFetchOptions()` to accept `signal?: AbortSignal` and include it in both GET and POST `RequestInit` objects.

Update `onError()` to detect abort/timeout:
```ts
if (error instanceof DOMException) {
    if (error.name === 'TimeoutError') → RpcError { type: 'request-timeout' }
    if (error.name === 'AbortError') → RpcError { type: 'request-aborted' }
}
```

### Step 5: `fetchRemoteMethodsMetadata.ts` — Accept signal

Add `signal?: AbortSignal` param, pass to `fetch()` call.

### Step 6: `routesFlow.ts` — Accept `CallOptions`

Add `options?: CallOptions` as third parameter to `routesFlow()`, forward to `client.executeCallWithWorkflow()`.

### Step 7: Tests in `client.spec.ts`

New test cases:
1. **Per-request cancellation**: abort controller + `call({ signal })` → error type `'request-aborted'`
2. **Per-request timeout**: `call({ timeout: 1 })` → error type `'request-timeout'`
3. **Global abort**: `client.abort()` during in-flight request → error type `'request-aborted'`
4. **Post-abort recovery**: after `client.abort()`, new requests succeed
5. **Already-aborted signal**: `AbortSignal.abort()` → immediate `'request-aborted'` without network
6. **Client-level timeout**: `initClient({ baseURL, timeout: 1 })` → error type `'request-timeout'`
7. **Per-request timeout overrides client**: client timeout=30000, call timeout=1 → times out fast
8. **destroy() aborts in-flight**: verify `client.destroy()` cancels pending requests

## Usage Examples

### Per-request cancellation (e.g. React component unmount)
```ts
const {client, routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// Create an AbortController for this request
const controller = new AbortController();

// Pass the signal to the call
const resultPromise = routes.sayHello({name: 'John', surname: 'Doe'}).call({signal: controller.signal});

// Cancel the request (e.g. on component unmount or user action)
controller.abort();

const [result, error] = await resultPromise;
// error.type === 'request-aborted'
```

### Per-request timeout
```ts
// This request will fail if it takes longer than 5 seconds
const [result, error] = await routes.sayHello(user).call({timeout: 5000});
if (error?.type === 'request-timeout') {
    console.log('Request took too long');
}
```

### Client-level default timeout
```ts
// All requests from this client will timeout after 10 seconds unless overridden
const {client, routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
    timeout: 10_000,
});

// This uses the 10s default
const [r1] = await routes.sayHello(user).call();

// This overrides to 2s for a specific call
const [r2, err] = await routes.sayHello(user).call({timeout: 2000});
```

### Global abort (e.g. SPA page navigation)
```ts
const {client, routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// Start multiple requests
const p1 = routes.sayHello(user).call();
const p2 = routes.utils.sumTwo(5).call();

// Cancel ALL in-flight requests (e.g. user navigated away)
client.abort();

// Both return 'request-aborted' errors
const [, err1] = await p1; // err1.type === 'request-aborted'
const [, err2] = await p2; // err2.type === 'request-aborted'

// New requests work normally after abort
const [greeting] = await routes.sayHello(user).call(); // works fine
```

### Combined with callWithMiddleFns and callWithWorkflow
```ts
// Cancellation works with all call variants
const [result, error, mfResults, mfErrors] = await routes.sayHello(user).callWithMiddleFns(
    {auth: middleFns.auth(authHeaders)},
    {timeout: 5000, signal: controller.signal}
);

// And with routesFlow
const [results, errors, mfR, mfE] = await routesFlow(
    [routes.sayHello(user), routes.utils.sumTwo(5)],
    {auth: middleFns.auth(authHeaders)},
    {timeout: 10_000}
);
```

### React hook pattern
```ts
function useGreeting(user: User) {
    const [greeting, setGreeting] = useState<string>();
    const [error, setError] = useState<RpcError>();

    useEffect(() => {
        const controller = new AbortController();
        
        routes.sayHello(user)
            .call({signal: controller.signal})
            .then(([result, err]) => {
                if (err) setError(err);
                else setGreeting(result);
            });

        return () => controller.abort(); // cleanup on unmount
    }, [user]);

    return {greeting, error};
}
```

## Verification

```bash
# Run client tests
npx vitest run --project client

# Run all tests to ensure no regressions
npm run test

# Lint and format
npm run lint && npm run format
```
