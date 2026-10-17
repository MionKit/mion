---
type: fix
spec: guidelines
status: ready
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
