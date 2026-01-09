# Error Handling Implementation Specification

## Overview

This document describes the technical implementation of the error handling system defined in `ERROR_HANDLING_UX.md`. The implementation consists of three layers:

### Separation of Concerns

| Layer                         | Responsibility                                               |
| ----------------------------- | ------------------------------------------------------------ |
| **TypedPromise / TypedEvent** | Handler registration, error routing, tracking handled state  |
| **Client**                    | Response parsing, error distribution, triggering handlers    |
| **Response**                  | Per-SubRequest results, `@throwErrors` for unexpected errors |

**Key Principle**: TypedPromise and TypedEvent are "passive" - they hold handlers and route errors. The Client is "active" - it parses responses, identifies errors, and triggers the appropriate handlers.

---

## Part 1: TypedPromise Class

### Purpose

TypedPromise is a **passive container** that:

- Stores registered error handlers (`catchError`, `catchUnknown`)
- Provides methods to check if an error type has a handler
- Provides methods to execute handlers when called by the Client
- Does NOT execute fetch or parse responses (that's the Client's job)

### Class Definition

```typescript
/**
 * A Promise wrapper that provides typed error handling with chainable methods.
 * This is a passive container - the Client triggers handler execution.
 *
 * @typeParam S - Success type (the resolved value type, excluding RpcError)
 * @typeParam E - Error types union (string literal union of possible error types)
 */
class TypedPromise<S, E extends string> implements PromiseLike<S> {
  private errorHandlers: Map<string, ErrorHandler<any>>;
  private unknownHandler?: UnknownErrorHandler;
  private successHandler?: SuccessHandler<S>;
  private finallyHandler?: () => void;
  private handledErrors: Set<string>; // Track which errors have been handled

  // Promise resolution (controlled by Client)
  private resolve: (value: S) => void;
  private reject: (error: RpcError<string>) => void;

  constructor();
}

type ErrorHandler<E extends string> = (error: RpcError<E>) => void;
type UnknownErrorHandler = (error: RpcError<string>) => void;
type SuccessHandler<S> = (value: S) => void;
```

### Public Methods (User-facing, chainable)

```typescript
/**
 * Register success handler. Result is guaranteed to NOT be an RpcError.
 */
then<R = S>(onFulfilled?: (value: S) => R | PromiseLike<R>): TypedPromise<R, E>;

/**
 * Register handler for a specific error type.
 * Multiple catchError calls can be chained for different error types.
 */
catchError<T extends E>(
    errorType: T,
    handler: (error: RpcError<T>) => void
): TypedPromise<S, Exclude<E, T>>;

/**
 * Register handler for any error not caught by catchError.
 * Hook errors handled by onError() are suppressed and won't reach catchUnknown.
 */
catchUnknown(handler: UnknownErrorHandler): TypedPromise<S, E>;

/**
 * Register cleanup callback that always runs.
 */
finally(onFinally: () => void): TypedPromise<S, E>;
```

### Internal Methods (Called by Client)

```typescript
/**
 * Check if this TypedPromise has a handler for a specific error type.
 * Used by Client to determine routing.
 */
hasHandler(errorType: string): boolean;

/**
 * Check if an error has already been handled.
 * Used by Client to prevent duplicate handling.
 */
isErrorHandled(errorType: string): boolean;

/**
 * Mark an error type as handled.
 * Called by Client after executing a handler.
 */
markErrorHandled(errorType: string): void;

/**
 * Execute the appropriate handler for an error.
 * Returns true if a handler was executed, false if error should fall through.
 * Called by Client during error distribution.
 */
handleError(error: RpcError<string>): boolean;

/**
 * Execute success handler with the result.
 * Called by Client when request succeeds.
 */
handleSuccess(value: S): void;

/**
 * Execute the finally handler.
 * Called by Client after all other handlers.
 */
handleFinally(): void;
```

### Error Routing Logic

```typescript
/**
 * Execute the appropriate handler for an error.
 * Returns true if handled, false if should fall through to catchUnknown.
 */
handleError(error: RpcError<string>): boolean {
    // 1. Check for specific catchError handler
    const handler = this.errorHandlers.get(error.type);
    if (handler) {
        handler(error);
        this.markErrorHandled(error.type);
        return true;
    }

    // 2. Fall through to catchUnknown (if not suppressed by hook handler)
    // Note: Hook suppression is checked by Client BEFORE calling this method
    if (this.unknownHandler) {
        this.unknownHandler(error);
        return true;
    }

    return false;
}
```

---

## Part 2: TypedEvent Class

### Purpose

TypedEvent is a **passive container** that:

- Stores persistent error handlers for a specific hook (`onError`)
- Registers/unregisters handlers in the shared ErrorRegistry
- Does NOT execute handlers directly (the Client does that via ErrorRegistry)

### Class Definition

```typescript
/**
 * Persistent event emitter for hook error handling.
 * This is a passive container - the Client triggers handler execution via ErrorRegistry.
 *
 * @typeParam E - Error types union (string literal union of possible error types)
 */
class TypedEvent<E extends string> {
  private handlerId: string; // The hook ID this event is associated with
  private registry: ErrorRegistry;

  constructor(handlerId: string, registry: ErrorRegistry);
}
```

### Public Methods (User-facing, chainable)

```typescript
/**
 * Register a persistent error handler for this hook.
 * Handler is stored in ErrorRegistry and called by Client for ALL future requests.
 */
onError<T extends E>(
    errorType: T,
    handler: (error: RpcError<T>) => void
): TypedEvent<Exclude<E, T>>;

/**
 * Remove a previously registered error handler from ErrorRegistry.
 */
offError<T extends E>(errorType: T): TypedEvent<E | T>;
```

### Implementation

```typescript
onError<T extends E>(errorType: T, handler: ErrorHandler<T>): TypedEvent<Exclude<E, T>> {
    // Delegate to ErrorRegistry - Client will use registry to execute handlers
    this.registry.register(this.handlerId, errorType, handler);
    return this as unknown as TypedEvent<Exclude<E, T>>;
}

offError<T extends E>(errorType: T): TypedEvent<E | T> {
    this.registry.unregister(this.handlerId, errorType);
    return this as unknown as TypedEvent<E | T>;
}
```

---

## Part 3: ErrorRegistry (Shared State)

### Purpose

The `ErrorRegistry` is a singleton/shared instance that maintains the mapping between handlers (hooks/routes) and their error handlers. It enables the error suppression logic where hook errors handled by `onError()` don't propagate to route's `catchUnknown()`.

### Class Definition

```typescript
/**
 * Central registry for error handlers.
 * Shared between TypedPromise and TypedEvent instances.
 */
class ErrorRegistry {
  private handlers: Map<string, Map<string, ErrorHandler<any>>>;

  /**
   * Register an error handler for a handler (hook/route).
   * @param handlerId - The unique identifier for the handler (e.g., hook ID)
   * @param errorType - The error type string
   * @param handler - The callback to execute when this error occurs
   */
  register(handlerId: string, errorType: string, handler: ErrorHandler<any>): void;

  /**
   * Unregister an error handler.
   * @param handlerId - The unique identifier for the handler
   * @param errorType - The error type to remove
   */
  unregister(handlerId: string, errorType: string): void;

  /**
   * Check if a handler exists for a specific handler and error type.
   * @param handlerId - The unique identifier for the handler
   * @param errorType - The error type to check
   */
  hasHandler(handlerId: string, errorType: string): boolean;

  /**
   * Get and execute the handler for an error, if exists.
   * @param handlerId - The unique identifier for the handler
   * @param error - The RpcError to handle
   * @returns true if handler was executed, false otherwise
   */
  executeHandler(handlerId: string, error: RpcError<string>): boolean;

  /**
   * Clear all handlers for a specific handler ID.
   * Called when removePrefill() is invoked.
   * @param handlerId - The unique identifier for the handler
   */
  clearHandlers(handlerId: string): void;

  /**
   * Clear all registered handlers.
   * Called when client is destroyed.
   */
  clearAll(): void;
}
```

---

## Part 4: Response Structure & Client Error Distribution

### Response Body Structure

Each SubRequest (route or hook) has its own result or error in the response body:

```typescript
interface ResponseBody {
  // Each SubRequest ID maps to its result OR error
  [subRequestId: string]: SuccessResult | RpcError<string>;

  // Unexpected thrown errors (not returned RpcErrors, but actual throws)
  // Each property is the route/hook ID that threw
  '@throwErrors'?: {
    [handlerId: string]: RpcError<string>;
  };
}

// Example response with mixed results:
{
  "auth": void,                           // Hook succeeded (no return value)
  "users.getProfile": { id: 1, name: "John" },  // Route succeeded
  "@throwErrors": {
    "rateLimit": { type: "rate-exceeded", publicMessage: "..." }  // Hook threw
  }
}
```

### Client Error Distribution Logic

The Client is responsible for:

1. Parsing the response
2. Identifying errors per SubRequest
3. Routing errors to appropriate handlers
4. Managing suppression logic

```typescript
// In Client - after receiving response
async distributeResults(response: ResponseBody, typedPromise: TypedPromise): void {
    const routeId = this.route.id;
    const hookIds = this.hooks.map(h => h.id);

    // 1. Check for thrown errors first (@throwErrors)
    const thrownErrors = response['@throwErrors'] || {};

    // 2. Process hook errors first (they can suppress route's catchUnknown)
    for (const hookId of hookIds) {
        const hookError = thrownErrors[hookId] || this.getErrorFromBody(response, hookId);
        if (hookError) {
            // Check if hook has onError handler in ErrorRegistry
            const handled = this.errorRegistry.executeHandler(hookId, hookError);
            if (handled) {
                // Mark as handled - will suppress catchUnknown
                typedPromise.markErrorHandled(hookError.type);
            }
        }
    }

    // 3. Process route result/error
    const routeResult = response[routeId];
    const routeError = thrownErrors[routeId];

    if (routeError || isRpcError(routeResult)) {
        const error = routeError || routeResult;
        // Try catchError handlers first, then catchUnknown (if not suppressed)
        if (!typedPromise.isErrorHandled(error.type)) {
            typedPromise.handleError(error);
        }
    } else {
        // Success
        typedPromise.handleSuccess(routeResult);
    }

    // 4. Always call finally
    typedPromise.handleFinally();
}
```

### Error Flow Diagram

```
Response received
       │
       ▼
┌──────────────────────────────────────┐
│ Client parses response body          │
│ - Regular results per SubRequest ID  │
│ - @throwErrors for unexpected throws │
└──────────────────┬───────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
  Hook Errors             Route Result
       │                       │
       ▼                       ▼
┌──────────────┐        ┌──────────────┐
│ ErrorRegistry│        │ isRpcError?  │
│ .hasHandler? │        └──────┬───────┘
└──────┬───────┘               │
       │                 ┌─────┴─────┐
  ┌────┴────┐            │           │
  │         │         Success      Error
 Yes        No           │           │
  │         │            ▼           ▼
  ▼         │    ┌────────────┐ ┌─────────────────┐
Execute     │    │ .then()    │ │ .catchError()?  │
handler     │    │ handler    │ └────────┬────────┘
  │         │    └────────────┘          │
  ▼         │                      ┌─────┴─────┐
Mark as     │                      │           │
handled     │                    Found     Not Found
  │         │                      │           │
  └────┬────┘                      ▼           ▼
       │                      Execute    ┌───────────┐
       │                      handler    │Suppressed?│
       │                         │       └─────┬─────┘
       │                         │             │
       │                         │       ┌─────┴─────┐
       │                         │       │           │
       │                         │      Yes          No
       │                         │       │           │
       │                         │    (skip)         ▼
       │                         │              .catchUnknown()
       │                         │                   │
       └─────────────────────────┴───────────────────┘
                                 │
                                 ▼
                           .finally()
```

---

## Part 5: Type Utilities

### Existing Types (Already in types.ts)

The codebase already has the type utilities needed to split success from error types:

```typescript
// Already exists in types.ts
type HandlerResponse<PH extends PublicHandler> = Awaited<ReturnType<PH>>;

// Success type: excludes RpcError from the response union
type HandlerSuccessResponse<PH extends PublicHandler> = Exclude<HandlerResponse<PH>, RpcError<string>>;

// Error type: extracts RpcError from the response union
type HandlerFailResponse<PH extends PublicHandler> = Extract<HandlerResponse<PH>, RpcError<string>>;
```

### New Type: Extract Error Type String

We need one additional utility to extract the error type string from `RpcError<E>`:

```typescript
/**
 * Extract the error type string(s) from an RpcError type.
 * Given: RpcError<'cart-empty' | 'payment-declined'>
 * Returns: 'cart-empty' | 'payment-declined'
 */
type ExtractErrorType<T> = T extends RpcError<infer E> ? E : never;

// Usage with existing types:
type HandlerErrorTypes<PH extends PublicHandler> = ExtractErrorType<HandlerFailResponse<PH>>;
```

### TypedPromise/TypedEvent Factory Types

```typescript
/**
 * Creates the correct TypedPromise type from a PublicHandler.
 * Success type uses existing HandlerSuccessResponse (guaranteed not RpcError)
 * Error type extracts the string union from HandlerFailResponse
 */
type TypedPromiseFromHandler<PH extends PublicHandler> = TypedPromise<
  HandlerSuccessResponse<PH>,
  ExtractErrorType<HandlerFailResponse<PH>>
>;

/**
 * Creates the correct TypedEvent type from a PublicHandler.
 */
type TypedEventFromHandler<PH extends PublicHandler> = TypedEvent<ExtractErrorType<HandlerFailResponse<PH>>>;
```

### Key Guarantee

**The returned value from `.call()` is guaranteed to NOT be an error.**

- Errors are rejected/thrown, not returned
- `HandlerSuccessResponse<PH>` already excludes `RpcError`
- The `.then()` handler receives `HandlerSuccessResponse<PH>` directly
- Errors go through `.catchError()` or `.catchUnknown()`

---

## Part 6: Integration with Existing Code

### Modified RouteSubRequest Interface

```typescript
// In types.ts - Updated RouteSubRequest interface
export interface RouteSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
  typeErrors: () => Promise<RunTypeError[]>;
  hooks: <RHList extends HookSubRequest<any>[]>(...hooks: RHList) => RouteSubRequest<PH>;

  // CHANGED: Returns TypedPromise instead of Promise
  // Uses existing HandlerSuccessResponse (guaranteed not RpcError)
  // Uses new HandlerErrorTypes for the error type string union
  call: () => TypedPromise<HandlerSuccessResponse<PH>, HandlerErrorTypes<PH>>;
}
```

### Modified HookSubRequest Interface

```typescript
// In types.ts - Updated HookSubRequest interface
export interface HookSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
  typeErrors: () => Promise<RunTypeError[]>;
  removePrefill: () => Promise<void>;

  // CHANGED: Returns TypedEvent instead of Promise<void>
  prefill: () => TypedEvent<HandlerErrorTypes<PH>>;
}
```

### Client.call() Flow

```typescript
// In client.ts - The call() method orchestrates everything
call(): TypedPromise<S, E> {
    // 1. Create TypedPromise (passive container)
    const typedPromise = new TypedPromise<S, E>();

    // 2. Execute the actual request asynchronously
    this.executeRequest().then(response => {
        // 3. Client distributes results to TypedPromise
        this.distributeResults(response, typedPromise);
    }).catch(networkError => {
        // 4. Network errors go to catchUnknown
        const rpcError = new RpcError({ type: 'network-error', ... });
        typedPromise.handleError(rpcError);
        typedPromise.handleFinally();
    });

    // 5. Return immediately - user chains handlers
    return typedPromise;
}
```

### Client.prefill() Flow

```typescript
// In client.ts - The prefill() method for hooks
prefill(): TypedEvent<E> {
    // 1. Create TypedEvent linked to this hook
    const typedEvent = new TypedEvent<E>(this.hookId, this.errorRegistry);

    // 2. Execute validation and storage (existing logic)
    this.request.prefill().catch(error => {
        // Prefill errors are thrown, not handled by TypedEvent
    });

    // 3. Return TypedEvent for chaining onError handlers
    return typedEvent;
}
```

---

## Part 7: Complete Example Flow

### Route Call with Error Handling

```typescript
// User code:
routes.checkout
  .createOrder(cartData)
  .call() // Returns TypedPromise<Order, 'cart-empty' | 'payment-declined'>
  .then((order) => setOrder(order)) // order: Order (never RpcError)
  .catchError('cart-empty', (e) => showCartError()) // Returns TypedPromise<Order, 'payment-declined'>
  .catchError('payment-declined', (e) => showPaymentError()) // Returns TypedPromise<Order, never>
  .catchUnknown((e) => showGenericError()) // Catches hook errors, network errors
  .finally(() => setLoading(false));

// Internal execution (by Client):
// 1. call() creates TypedPromise (passive), starts async fetch
// 2. User chains handlers on TypedPromise (handlers stored, not executed)
// 3. Client receives response, parses body
// 4. Client processes hook errors first via ErrorRegistry
// 5. Client calls typedPromise.handleSuccess() or typedPromise.handleError()
// 6. TypedPromise routes to appropriate handler
// 7. Client calls typedPromise.handleFinally()
```

### Hook Prefill with Persistent Error Handling

```typescript
// User code:
hooks
  .credentials({token: getToken()})
  .prefill() // Returns TypedEvent<'invalid-token' | 'expired-token'>
  .onError('invalid-token', (e) => redirectToLogin()) // Returns TypedEvent<'expired-token'>
  .onError('expired-token', (e) => refreshToken()); // Returns TypedEvent<never>

// Internal execution:
// 1. prefill() validates and stores hook params
// 2. prefill() creates TypedEvent linked to this hook's ID
// 3. onError() registers handler in ErrorRegistry (not executed yet)
// 4. Future requests that fail with 'invalid-token' from this hook:
//    a. Client checks ErrorRegistry.hasHandler(hookId, errorType)
//    b. Client calls ErrorRegistry.executeHandler() - handler runs
//    c. Client marks error as handled
//    d. Route's catchUnknown is suppressed (not called)
```

---

## Part 8: File Structure

New/Modified files in `packages/client/src/`:

```
src/
├── typedPromise.ts       # NEW: TypedPromise class implementation
├── typedEvent.ts         # NEW: TypedEvent class implementation
├── errorRegistry.ts      # NEW: ErrorRegistry singleton
├── types.ts              # MODIFIED: Add type utilities, update interfaces
├── request.ts            # MODIFIED: call() returns TypedPromise
├── client.ts             # MODIFIED: Wire up registry, create TypedEvent from prefill
└── index.ts              # MODIFIED: Export new classes
```

---

## Part 9: Edge Cases & Considerations

### 1. Multiple Hooks with Same Error Type

When multiple hooks can return the same error type (e.g., both auth and permissions hooks return 'unauthorized'):

```typescript
// Both handlers are registered in ErrorRegistry
hooks.auth(token).prefill().onError('unauthorized', handleAuthError);
hooks.permissions(role).prefill().onError('unauthorized', handlePermError);

// When 'unauthorized' error occurs:
// - Response body identifies which hook failed (by hook ID)
// - Client looks up handler in ErrorRegistry by hookId + errorType
// - Only the matching hook's handler is called
```

### 2. catchError vs onError Priority

- `catchError` handlers are per-request and take precedence for route errors
- `onError` handlers are persistent and only handle hook errors
- An error from a route is never handled by `onError`
- An error from a hook is first checked against `onError`, then falls to `catchUnknown`

### 3. Network/Fetch Errors

Network errors (fetch fails, timeout, etc.) are wrapped in RpcError:

```typescript
new RpcError({
  type: 'network-error',
  publicMessage: 'Failed to connect to server',
});
```

These always go to `catchUnknown` (no `catchError` or `onError` match).

### 4. Promise/A+ Compatibility

`TypedPromise` implements `PromiseLike<S>` for compatibility with:

- `async/await` syntax
- Promise utilities (Promise.all, etc.)
- Standard `.then()` chaining

---

## Open Questions for Review

1. **Hook Error Identification**: How do we identify which hook an error originated from? Options:
   - Add `hookId` property to RpcError
   - Use error.id pattern (e.g., `hookId:errorType`)
   - Maintain request-scoped error origin tracking

2. **TypedEvent Lifecycle**: When should registered handlers be cleaned up?
   - On `removePrefill()`?
   - Manual `offError()` only?
   - On client destroy?

3. **Type Narrowing**: Should `catchError` narrow the E type parameter?
   - Current design: Yes (`Exclude<E, T>`)
   - Benefit: TypeScript can track unhandled errors
   - Tradeoff: More complex type signatures

4. **Async Handlers**: Should `catchError`/`onError` support async handlers?
   ```typescript
   .catchError('payment-failed', async (e) => {
       await logToServer(e);
       showError(e);
   })
   ```
