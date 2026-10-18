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
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan: keep cookies apart (approved 2026-10-17, automatic delegated run; reworked 2026-10-18 after owner review)

Each platform owns its response headers, the way bun, cloudflare and vercel already do. The router's
`headersFromRecord` stays a generic record view and does not change.

- aws: response headers are Node's own `Headers`, built like bun's (`getResponseDefaults(..., SERVER_HEADER)`).
  `Headers` keeps each `set-cookie` apart natively. `reply` sends every other name as `headers` and
  `getSetCookie()` as `multiValueHeaders`. The old array branch over `entries()` is gone: on main nothing put an
  array there. Side effects, same as bun / cloudflare / vercel: default header names go out lower-cased,
  `entries()` lists each cookie as its own pair, and a CR / LF value throws instead of reaching the wire.
- uws: `BufferedHeadersImpl` (already uws-owned) holds an array for `set-cookie` only. `forEachHeader` visits each
  value, so the corked reply calls `res.writeHeader` once per cookie. `get` / `entries` / `values` join. An empty
  earlier value counts as absent, as in the router. `forEachHeader` lost its `entries()` fallback: it never ran,
  and it would fold cookies again.
- Related fix, own commit: the uws buffer record is now null-prototype, so `append('constructor', …)` no longer
  reads Object.prototype's function as an earlier value.
- Tests: aws handler test (two cookies in `multiValueHeaders`, `x-list` still comma joined, a mixed-case default
  name lower-cased), uws server test (`getSetCookie()` gives two values), uws buffer unit tests. The cookie,
  `constructor` and lower-case tests failed before the fix; the comma join tests guard against regression.
- Dropped along the way: putting the cookie list in the router's shared class (platform logic belongs in the
  platform package), then an aws-only wrapper class around `headersFromRecord` (Node's `Headers` already does it).
- Docs: none. Fuzzing: not a feature.
