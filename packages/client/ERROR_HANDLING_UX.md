# Error Handling UX Design

## Overview

Mion provides a sophisticated error handling system that separates concerns between hook errors (authentication, rate limiting, etc.) and route errors (business logic). This design provides the best developer experience for frontend applications.

---

## Core Concepts

### 1. Hook Errors vs Route Errors

**Hook Errors** - Global concerns (authentication, permissions, rate limiting)

- hook.prefill() - return an event listener Handled once, globally
- Use `.onError<Type>()` - called **multiple times** (every request that fails)
- Examples: `invalid-token`, `rate-limit-exceeded`, `insufficient-permissions`

**Route Errors** - Business logic concerns (validation, not found, etc.)

- Handled per-request
- Use `.catchError<Type>()` - called **once** (for this specific request)
- Examples: `cart-empty`, `payment-declined`, `user-not-found`

### 2. Automatic Error Suppression

If a hook error is handled by `.onError()`, the route's `.catchError<'X-error'>()` or `catch()` is **not called** - preventing duplicate error messages.
a method called `unknownCatch()` will be called with any errors not defined in route return type. (this included errors that might already been handled by `hooks.onError()` )

### 3. Type Safety

Error types are declared in the route's return type signature:

```typescript
// Server
export const createOrder = route(
  async (ctx, data): Promise<Order | RpcError<'cart-empty' | 'payment-declined' | 'out-of-stock'>> => {
    // ...
  }
);
```

TypeScript validates that `.catchError<Type>()` types exist in the union.

---

## API Reference

### Routes

```typescript
routes
  .someRoute(params)
  .call()
  .then((result) => {
    /* Success - result is never RpcError */
  })
  .catchError<'specific-error'>((error) => {
    /* Handle specific error */
  })
  .unknownCatch((error) => {
    /* Handle any unhandled error */
  })
  .finally(() => {
    /* Cleanup */
  });
```

### Hooks

```typescript
hooks
  .someHook(params)
  .prefill()
  .onError<'specific-error'>((error) => {
    /* Called every time this error occurs */
  });
```

---

## Usage Examples

### Example 1: Login Flow (Setup Global Credentials Handler)

```typescript
function LoginPage() {
  async function handleLogin(email: string, password: string) {
    try {
      const response = await routes.auth.login(email, password).call();

      // Store credentials for ALL future requests
      // Handle credential errors GLOBALLY
      hooks.credentials({ token: response.token })
        .prefill()
        .onError<'invalid-token'>((error) => {
          // Called EVERY TIME any future request fails with invalid-token
          toast.error('Session expired. Please login again.');
          redirectToLogin();
        })
        .onError<'token-expired'>((error) => {
          // Called EVERY TIME any future request fails with token-expired
          toast.error('Session expired. Please login again.');
          redirectToLogin();
        });

      navigate('/dashboard');
    } catch (error) {
      toast.error('Invalid email or password');
    }
  }

  return <LoginForm onSubmit={handleLogin} />;
}
```

### Example 2: Checkout Flow (Handle Business Logic Errors)

```typescript
function CheckoutPage() {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState(null);

  async function handleCheckout(cartData) {
    setLoading(true);

    // Credentials are already prefilled from login
    // Just handle business logic errors
    routes.checkout.createOrder(cartData)
      .call()
      .then((orderData) => {
        // Success! orderData is Order (never RpcError)
        setOrder(orderData);
        toast.success('Order created!');
      })
      .catchError<'cart-empty'>((error) => {
        // Handle specific error
        toast.error('Your cart is empty!');
        navigate('/cart');
      })
      .catchError<'payment-declined'>((error) => {
        // Handle specific error with typed error data
        toast.error(`Payment declined: ${error.errorData.reason}`);
        // Stay on page, user can update payment method
      })
      .catchError<'out-of-stock'>((error) => {
        // Handle specific error
        toast.error(`Sorry, ${error.errorData.itemName} is out of stock`);
        // Stay on page, user can remove item
      })
      .unknownCatch((error) => {
        // Handle any other error:
        // - Hook errors (if not handled by hook.onError())
        // - Unlisted route errors
        // - Network errors
        toast.error('Something went wrong. Please try again.');
        logToSentry(error);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div>
      {loading && <Spinner>Processing order...</Spinner>}
      {order && <OrderConfirmation order={order} />}
      <CheckoutForm onSubmit={handleCheckout} />
    </div>
  );
}
```

### Example 3: Simple Case (Only Unknown Errors)

```typescript
function UserProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    routes.users.getProfile()
      .call()
      .then((data) => {
        setProfile(data);
      })
      .unknownCatch((error) => {
        // Handle all errors generically
        toast.error('Failed to load profile');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) return <Spinner />;
  return <ProfileView profile={profile} />;
}
```

### Example 4: Multiple Hooks (Rate Limiting + Credentials)

```typescript
// Setup rate limiting hook globally
hooks.rateLimit({ apiKey: getApiKey() })
  .prefill()
  .onError<'rate-limit-exceeded'>((error) => {
    toast.error('Rate limit exceeded. Please upgrade your plan.');
    showUpgradeModal();
  });

// Setup credentials hook globally
hooks.credentials({ token: getToken() })
  .prefill()
  .onError<'invalid-token'>((error) => {
    toast.error('Session expired. Please login again.');
    redirectToLogin();
  });

// Later, in any component
function DataTable() {
  async function fetchData() {
    routes.data.fetch()
      .call()
      .then((data) => {
        setData(data);
      })
      .catchError<'invalid-query'>((error) => {
        toast.error('Invalid query parameters');
      })
      .unknownCatch((error) => {
        // This is NOT called if rate limit or credentials fail
        // (those are handled by hook.onError())
        toast.error('Failed to load data');
      });
  }

  return <Table data={data} />;
}
```

### Example 5: React Hook Pattern

```typescript
function useAuthenticatedRoute<T>(routeCall: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function execute() {
    setLoading(true);
    setError(null);

    routeCall()
      .then((result) => {
        setData(result);
      })
      .unknownCatch((err) => {
        // Credentials errors are handled globally (redirect to login)
        // This only handles route-specific errors
        setError(err.publicMessage);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return { execute, data, loading, error, retry: execute };
}

// Usage
function UserProfile() {
  const { execute, data, loading, error, retry } = useAuthenticatedRoute(
    () => routes.users.getProfile().call()
  );

  useEffect(() => {
    execute();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Error message={error} onRetry={retry} />;
  return <ProfileView profile={data} />;
}
```

---

## Benefits

### 1. No Duplicate Error Messages

Hook errors handled by `.onError()` automatically suppress route `.unknownCatch()`:

```typescript
// If credentials fail:
// ✅ Hook .onError() shows: "Session expired. Please login again."
// ❌ Route .unknownCatch() is NOT called (no duplicate message)
```

### 2. Separation of Concerns

```typescript
// Login page: Handle auth errors ONCE
hooks.credentials({token}).prefill().onError(redirectToLogin);

// Every other page: Just handle business logic
routes.someRoute(data).call().catchError<'business-error'>(handleBusinessError).unknownCatch(handleGenericError);
```

### 3. Type Safety

```typescript
// TypeScript validates error types
routes.checkout.createOrder(data)
  .call()
  .catchError<'cart-empty'>((error) => { ... })      // ✅ Valid
  .catchError<'invalid-type'>((error) => { ... });   // ❌ TypeScript error!
```

### 4. Progressive Enhancement

Start simple, add specific handlers as needed:

```typescript
// Day 1: Generic error handling
routes.someRoute(data)
  .call()
  .unknownCatch((error) => toast.error(error.publicMessage));

// Day 30: Add specific handlers
routes.someRoute(data)
  .call()
  .catchError<'common-error'>((error) => { ... })
  .unknownCatch((error) => toast.error(error.publicMessage));

// Day 90: Handle all errors specifically
routes.someRoute(data)
  .call()
  .catchError<'error-1'>((error) => { ... })
  .catchError<'error-2'>((error) => { ... })
  .catchError<'error-3'>((error) => { ... })
  .unknownCatch((error) => { ... });
```

---

## ESLint Integration

An ESLint rule enforces exhaustive error handling:

```typescript
// Server declares error types
export const createOrder = route(
  async (ctx, data): Promise<Order | RpcError<'cart-empty' | 'payment-declined' | 'out-of-stock'>> => {
    // ...
  }
);

// Client - Missing handler
routes.checkout.createOrder(data)
  .call()
  .catchError<'cart-empty'>((error) => { ... })
  .catchError<'payment-declined'>((error) => { ... })
  // Missing: 'out-of-stock'
  .unknownCatch((error) => { ... });

// ⚠️ ESLint warning:
// "Unhandled error type 'out-of-stock' from route 'checkout.createOrder'.
//  Add .catchError<'out-of-stock'>() or use .ignoreErrors(['out-of-stock'])"
```

### Explicitly Ignore Errors

```typescript
routes.checkout.createOrder(data)
  .call()
  .catchError<'cart-empty'>((error) => { ... })
  .ignoreErrors(['payment-declined', 'out-of-stock'])
  .unknownCatch((error) => { ... });

// ✅ No ESLint warning (explicitly acknowledged)
```

---

## Summary

**API:**

- `.call()` - Execute the request
- `.then()` - Handle success (result is never RpcError)
- `.catchError<Type>()` - Handle specific error type (one-time, for this request)
- `.unknownCatch()` - Handle any unhandled error (catch-all)
- `.onError<Type>()` - Handle hook error (persistent, for all future requests)
- `.prefill()` - Store hook params for all future requests
- `.ignoreErrors([...])` - Explicitly ignore error types (for ESLint)
- `.finally()` - Cleanup (always runs)

**Key Principles:**

1. Hook errors are handled globally (once, in login/setup)
2. Route errors are handled locally (per-request)
3. Hook error handlers suppress route error handlers (no duplicates)
4. Type safety ensures error types are valid
5. ESLint enforces exhaustive error handling
6. Progressive enhancement (start simple, add specificity)
