# Client Package - Maturity & Stability Improvements

Features to improve robustness and bring the client closer to production-grade libraries like axios.
Caching is excluded (will be addressed separately alongside router changes).

---

## 1. Request Cancellation (AbortController)

Allow cancelling in-flight requests via `AbortController`/`AbortSignal`.

- Support per-request signals passed as an option
- Global `client.abort()` to cancel all pending requests
- Essential for SPA navigation (unmounting components mid-request) and user-triggered cancels
- Cancelled requests should return a clear `RpcError` with a distinct error type (e.g. `aborted`)

## 2. Request Timeouts

Configurable timeout at client level and per-request override.

- Add `timeout` to `ClientOptions` (ms, default: none / platform default)
- Per-request override via call options
- Implemented via `AbortSignal.timeout()` or manual `AbortController` + `setTimeout`
- Return a clear `RpcError` with a distinct error type (e.g. `timeout`)
- Composes with cancellation (both use AbortController internally)

## 3. Automatic Retries with Backoff

Configurable retry for transient failures.

- Options: `retries` (count), `retryDelay` (strategy: exponential backoff + jitter)
- Only retry on transient failures (network errors, 5xx) - not on 4xx or validation errors
- Already have the optimistic-retry pattern as precedent; generalize it
- Respect `Retry-After` headers when present
- Aborted/cancelled requests should not be retried

## 4. Request/Response Interceptors

Global hooks for cross-cutting concerns.

- `onBeforeRequest(req)` - modify request before sending (auth tokens, custom headers, logging)
- `onAfterResponse(res)` - inspect/transform response (analytics, normalization)
- `onError(err)` - global error handling (reporting, toast notifications)
- Composable: multiple interceptors, ordered execution
- Return value from interceptors can modify or short-circuit the pipeline

## 5. Logging / Debug Mode

Observable request lifecycle for development troubleshooting.

- A `debug` or `logLevel` option in `ClientOptions`
- Logs: request/response cycles, timing, serialization mode chosen, metadata fetches, retries
- Pluggable logger interface (default: `console`) so consumers can integrate with their logging stack
- Zero overhead when disabled (no string formatting or object cloning)

## 6. Request Deduplication

If the same route+params is already in-flight, return the existing promise instead of firing a duplicate.

- Particularly valuable for React/Vue where multiple components may request the same data on mount
- Configurable: opt-in per route or globally via `ClientOptions`
- Key generation based on route ID + serialized params
- Deduplication window only covers in-flight requests (not a cache)

## 7. Retry on Network Reconnect

Lightweight handling for flaky connections.

- Detect when the browser comes back online (`navigator.onLine` / `online` event)
- Automatically retry the last failed request(s) that failed due to network errors
- Lightweight alternative to full offline support - just handles the "flaky connection" case
- Configurable: opt-in, max age of failed requests to retry

## 8. Improved Error Classification

Structured error types for better consumer decision-making.

- Distinguish between: network errors, timeout errors, server errors (5xx), client errors (4xx), validation errors, serialization errors, aborted
- Expose a well-defined error type enum/union so consumers can `switch` on it
- Makes retry logic and error UI decisions much simpler
- Builds on existing `RpcError` - extend rather than replace

## 9. Request Timing / Metrics

Track performance data per request.

- `startTime`, `endTime`, `duration` per request
- Expose via interceptor hooks or as metadata alongside results
- Enables performance monitoring without external tooling
- Include metadata fetch time separately when applicable

## 10. Concurrent Request Limiting

Cap the number of simultaneous in-flight requests.

- Configurable max concurrency (e.g., max 6 simultaneous requests)
- Queue excess requests and drain as slots free up
- Prevents overwhelming the server during bulk operations (e.g., paginated fetches)
- Priority support: some requests can skip the queue

---

## Recommended Implementation Order

### Phase 1 - Table Stakes
**Cancellation + Timeouts (1 & 2)** - Every serious HTTP client has them. They share the same `AbortController` mechanism so they naturally pair.

### Phase 2 - Resilience & Extensibility
**Retries (3) + Interceptors (4)** - Dramatically improve real-world resilience and enable consumers to plug in auth, logging, analytics without forking.

### Phase 3 - Developer Experience
**Error Classification (8) + Logging (5) + Timing (9)** - These three reinforce each other: structured errors feed into logging which includes timing.

### Phase 4 - Optimization
**Deduplication (6) + Concurrency Limiting (10) + Network Reconnect (7)** - Nice-to-haves that round out the library for high-traffic production use.
