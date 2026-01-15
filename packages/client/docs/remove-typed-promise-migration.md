# Migration: Remove TypedPromise and Adopt Result Pattern Only

## Overview

This document outlines the plan to simplify the mion client API by:

1. **Removing `TypedPromise`** class entirely
2. **Removing `call()` method** from RouteSubRequest
3. **Standardizing on Result pattern** for all route calls
4. **Keeping `TypedEvent`** for prefilled hook handlers (fire-and-forget)

## Current vs Proposed API

### Current API (Multiple Patterns)

```typescript
// Pattern 1: TypedPromise with chainable handlers
routes.users
  .getById('123')
  .call()
  .then((user) => console.log(user))
  .catchError('not-found', (e) => console.log(e.errorData))
  .catchUnknown((e) => console.log(e))
  .finally(() => setLoading(false));

// Pattern 2: Result pattern (async/await)
const {data, error} = await routes.users.getById('123').result();

// Pattern 3: Plain promise (loses typing)
const user = await routes.users.getById('123').promise();

// Pattern 4: Result with hooks
const {data, errors} = await routes.users.getById('123').callWithHooks({
  auth: hooks.auth(headers),
});
```

### Proposed API (Result Pattern Only)

```typescript
// Primary API: Result pattern
const {data, error} = await routes.users.getById('123').call();

// With hooks
const {data, errors} = await routes.users.getById('123').call({
  auth: hooks.auth(headers),
});

// Prefilled hooks with TypedEvent (unchanged)
hooks
  .auth(token)
  .prefill()
  .onSuccess((session) => updateContext(session))
  .onError('invalid-token', () => redirectToLogin());
```

## Behavior Changes

### Error Handling

| Scenario               | Current Behavior                              | New Behavior                                            |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Route error            | `catchError()` handler called                 | Error in `result.error`                                 |
| Hook error (prefilled) | `onError()` called, suppresses `catchUnknown` | `onError()` called, error ALSO in `result.errors.hooks` |
| Hook error (inline)    | Passed to `catchUnknown`                      | Error in `result.errors.hooks`                          |
| Unhandled error        | `catch()` receives record                     | Error in result, no throw                               |

### Prefilled Hook Handlers

Prefilled hooks with `onSuccess`/`onError` handlers work as **fire-and-forget observers**:

```typescript
// Register persistent handlers
hooks
  .auth(token)
  .prefill()
  .onSuccess((session) => {
    // Called on every successful request - OBSERVER only
    analytics.track('authenticated', session.userId);
  })
  .onError('invalid-token', () => {
    // Called on every failure - OBSERVER only
    redirectToLogin();
  });

// Make request - handlers run, but error is ALSO in result
const {data, errors} = await routes.users.getById('123').call();

// User can still check errors if needed
if (errors?.auth?.type === 'invalid-token') {
  // This code also runs - no suppression
  showErrorBanner('Session expired');
}
```

**Key Point**: Handlers are observers, not interceptors. Errors are always visible in the result.

## Files to Modify

### 1. Remove: `packages/client/src/typedPromise.ts`

Delete entirely.

### 2. Modify: `packages/client/src/types.ts`

```typescript
// REMOVE
import type {TypedPromise} from './typedPromise';

// CHANGE RouteSubRequest interface
export interface RouteSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    // REMOVE
    call: () => TypedPromise<HandlerSuccessResponse<PH>, HandlerErrors<PH>>;

    // REMOVE
    promise: () => Promise<HandlerSuccessResponse<PH>>;

    // KEEP but rename
    result: () => Promise<Result<HandlerSuccessResponse<PH>, HandlerErrors<PH>>>;

    // KEEP but merge with result
    callWithHooks: ...;

    // NEW: Unified call method
    call: <H extends Record<string, HookSubRequest<any>> = {}>(
        hooks?: H
    ) => Promise<CallResult<HandlerSuccessResponse<PH>, HandlerErrors<PH>, H>>;
}

// NEW: Unified result type
export type CallResult<S, E, H extends Record<string, HookSubRequest<any>>> =
    H extends Record<string, never>
        ? Result<S, E>  // No hooks: simple result
        : CallWithHooksResult<S, E, H>;  // With hooks: full result
```

### 3. Modify: `packages/client/src/subRequest.ts`

```typescript
// REMOVE
import {TypedPromise} from './typedPromise';

// CHANGE call() implementation
call<H extends Record<string, HookSubRequest<any>> = {}>(
    hooks?: H
): Promise<CallResult<S, E, H>> {
    if (hooks && Object.keys(hooks).length > 0) {
        // Delegate to callWithHooks logic
        return this.client.executeCallWithHooks(this, hooks, Object.values(hooks));
    }
    // Simple call without hooks
    return this.client.executeCall(this);
}

// REMOVE
promise(): Promise<S> { ... }

// REMOVE
result(): Promise<Result<S, E>> { ... }
```

### 4. Modify: `packages/client/src/client.ts`

```typescript
// REMOVE
import {TypedPromise} from './typedPromise';

// CHANGE executeCall to return Promise<Result>
executeCall<RR extends RouteSubRequest<any>>(
    routeSubRequest: RR
): Promise<Result<any, any>> {
    return new Promise((resolve) => {
        const request = new MionClientRequest(...);

        request.call()
            .then(() => {
                // Process prefilled hook success handlers (fire-and-forget)
                this.processHookSuccess(allHooks);

                // Return result
                resolve({ data: routeSubRequest.resolvedValue });
            })
            .catch((errors: RequestErrors) => {
                // Process prefilled hook error handlers (fire-and-forget)
                this.processHookErrors(allHooks, errors);

                // Return result with error
                const routeError = errors.get(routeSubRequest.id);
                resolve({ error: routeError });
            });
    });
}

// SIMPLIFY processHookErrors - no TypedPromise interaction
private processHookErrors(
    hookSubRequests: HookSubRequest<any>[],
    errors: RequestErrors
): void {
    for (const hook of hookSubRequests) {
        const hookError = errors.get(hook.id);
        if (hookError) {
            // Fire-and-forget: execute handler if registered
            this.handlersRegistry.executeHandler(hook.id, hookError);
            // No suppression logic - error still visible in result
        }
    }
}
```

### 5. Keep: `packages/client/src/typedEvent.ts`

No changes needed. TypedEvent continues to work with HandlersRegistry.

### 6. Keep: `packages/client/src/handlersRegistry.ts`

No changes needed. Still stores and executes persistent handlers.

## Migration Examples

### Before: Chainable Error Handling

```typescript
routes.users
  .getById('123')
  .call()
  .then((user) => {
    showUser(user);
  })
  .catchError('not-found', (e) => {
    showNotFound(e.errorData?.suggestedIds);
  })
  .catchError('forbidden', (e) => {
    showForbidden();
  })
  .catchUnknown((e) => {
    showGenericError(e.publicMessage);
  })
  .finally(() => {
    setLoading(false);
  });
```

### After: Result Pattern

```typescript
const {data: user, error} = await routes.users.getById('123').call();

if (error) {
  switch (error.type) {
    case 'not-found':
      showNotFound(error.errorData?.suggestedIds);
      break;
    case 'forbidden':
      showForbidden();
      break;
    default:
      showGenericError(error.publicMessage);
  }
} else {
  showUser(user);
}
setLoading(false);
```

### Before: With Hooks (callWithHooks)

```typescript
const {data, errors} = await routes.users.getById('123').callWithHooks({
  auth: hooks.auth(headers),
  session: hooks.session(token),
});
```

### After: Unified call() with hooks

```typescript
const {data, errors} = await routes.users.getById('123').call({
  auth: hooks.auth(headers),
  session: hooks.session(token),
});
```

### Prefilled Hooks (Unchanged)

```typescript
// This pattern remains exactly the same
hooks
  .auth(token)
  .prefill()
  .onSuccess((session) => {
    console.log('Authenticated as:', session.userId);
  })
  .onError('invalid-token', () => {
    redirectToLogin();
  });

// Handlers fire on every request, but don't suppress errors from result
const {error} = await routes.users.getById('123').call();
// error may contain 'invalid-token' even though onError handler ran
```

## New Type Definitions

```typescript
// Simple result (no hooks or empty hooks)
export type Result<S, E> = {data: S; error?: never} | {data?: never; error: E};

// Result with hooks
export type CallWithHooksResult<S, E, H extends Record<string, HookSubRequest<any>>> = {
  data: {
    route?: S;
    hooks: {[K in keyof H]?: HookSuccess<H[K]>};
  };
  errors: {
    route?: E;
    hooks: {[K in keyof H]?: HookError<H[K]>};
  };
};

// Unified call result type
export type CallResult<S, E, H extends Record<string, HookSubRequest<any>>> = keyof H extends never
  ? Result<S, E>
  : CallWithHooksResult<S, E, H>;
```

## Implementation Checklist

### Phase 1: Core Changes

- [ ] Delete `typedPromise.ts`
- [ ] Update `types.ts` with new interfaces
- [ ] Update `subRequest.ts` - new `call()` implementation
- [ ] Update `client.ts` - remove TypedPromise orchestration
- [ ] Update `client.ts` - `executeCall` returns `Promise<Result>`

### Phase 2: Simplify Client

- [ ] Remove `markErrorHandled` / `isErrorHandled` logic
- [ ] Simplify `processHookErrors` to fire-and-forget
- [ ] Remove `finalizeErrors` concept

### Phase 3: Tests

- [ ] Update `client.spec.ts` - remove TypedPromise tests
- [ ] Update `client.spec.ts` - add Result pattern tests
- [ ] Verify prefilled hook handlers still work

### Phase 4: Examples & Docs

- [ ] Update `examples/client.ts`
- [ ] Update `examples/client-usage.ts`
- [ ] Update website documentation

## Breaking Changes Summary

| Removed                         | Replacement                         |
| ------------------------------- | ----------------------------------- |
| `call()` returning TypedPromise | `call()` returning Promise<Result>  |
| `catchError()`                  | `if (error.type === 'x')`           |
| `catchUnknown()`                | `else` branch or default case       |
| `catch()`                       | Check `errors` object               |
| `finally()`                     | Use try/finally or call after await |
| `promise()`                     | N/A - use `call()` and check error  |
| `result()`                      | `call()` (same return type)         |
| `callWithHooks()`               | `call({ ...hooks })`                |
| Error suppression               | N/A - all errors visible in result  |

## Benefits

1. **Simpler mental model**: One pattern to learn
2. **Async/await native**: Works with standard JavaScript patterns
3. **Smaller bundle**: Remove ~280 lines of TypedPromise code
4. **Explicit error handling**: Forces developers to handle errors
5. **TypedEvent preserved**: Persistent handlers still work for prefilled hooks
