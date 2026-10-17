---
type: fix
spec: guidelines
status: done
created: 2026-10-17
---

# Two `set-cookie` values become one broken header on aws and uws

## Intent

A handler that sets two cookies:

```ts
ctx.response.headers.append('set-cookie', 'a=1');
ctx.response.headers.append('set-cookie', 'b=2');
```

gets them on separate `set-cookie` lines on node, gcloud, bun, cloudflare and vercel. On aws and uws the
response headers keep one string per name and `append` joins with a comma, so the reply sends one line,
`set-cookie: a=1, b=2`. Browsers read that as a single cookie `a=1` with junk after it: `b` is never set.
RFC 6265 forbids folding `set-cookie`.

Where, on `main` (2026-10-17):

- aws: `MionHeadersImpl.append` in `packages/rpc-router/src/lib/headers.ts`. `awsLambda.ts` `reply` already
  sends `multiValueHeaders` for array values, but the headers object never yields one.
- uws: `BufferedHeadersImpl.append` in `packages/platform-uws/src/headers.ts`; the corked reply writes each
  name once with `res.writeHeader`.

Found while reviewing the response headers rework: its per-adapter specs declare a `cookies` route on aws and
uws that no test calls, because the assertion fails there.

## Direction

The implementer investigates and plans the details.

- Keep `set-cookie` values apart on both adapters: aws through `multiValueHeaders`, uws with one
  `res.writeHeader` per value (uWS appends a repeated name).
- Other names keep today's comma join.
- Per adapter, a test with two appended cookies asserting two separate values reach the wire.
- Request headers are not in scope: only response headers carry `set-cookie`.

## Docs

None: no page promises cookie behaviour per adapter.

## Done when

- Two appended cookies reach the wire as two `set-cookie` values on aws and on uws, each pinned by a test.
- Every other repeated name keeps the comma join, and `get` / `entries` / `values` still return strings.

## Plan: keep cookies apart (approved 2026-10-17, automatic delegated run)

- aws: `MionHeadersImpl.append` stores a repeated `set-cookie` as a new string array (never the old one: it may
  belong to a platform record). An empty earlier value counts as absent, like the comma path. The record type is now
  `string | string[]`. `get` / `has` / `entries` / `values` all join. `awsLambda.ts` `reply` reads the record itself,
  not `entries()`, and sends the array as `multiValueHeaders`.
- The class is shared, so request headers on every adapter get the same append. Harmless: requests carry `cookie`.
- uws: `BufferedHeadersImpl.record` holds an array for `set-cookie` only. `forEachHeader` visits each value, so the
  corked reply calls `res.writeHeader` once per cookie. `get` / `entries` / `values` join.
- Related fix, own commit: the uws buffer record is now null-prototype, so `append('constructor', …)` no longer
  reads Object.prototype's function as an earlier value.
- Tests: router unit tests (three cookies, copy never mutate, empty value), aws handler test (two cookies in
  `multiValueHeaders`, `x-list` still comma joined), uws server test (`getSetCookie()` gives two values), uws buffer
  unit tests. The cookie and `constructor` tests failed before the fix; the comma join tests guard against regression.
- Docs: none. Fuzzing: not a feature.
