---
type: feature
spec: guidelines
status: ready
created: 2026-09-22
---

# A CORS middleware configured from the declared headers

## Intent

mion has no CORS surface at all. `Access-Control-Expose-Headers` appears nowhere in the repo, and the
middleware page lists CORS as work for your own middleware
(`container/website/content/01.rpc/02.server/02.middleware.md`, intro). The only examples that set any CORS
header did it through a generic default-headers option on the adapter; the one left is the router's
`responseHeaders`.

That already breaks a shipped feature. A route returning a `HeadersSubset` is read back by name on
the client:

```ts
// packages/rpc-client/src/lib/headers.ts, reconstructHeadersSubsetFromResponse
responseHeaders.get(name)
```

Cross-origin the browser hides every non-safelisted header, so that returns `null` for every name,
`reconstructHeadersSubsetFromResponse` gives `undefined`, the client falls through to an empty body
slot, and no error is raised. A split client and server deployment, which is the normal mion setup,
silently loses returned headers today.

Found while designing this, and fixed in the same PR: the server never reads the HTTP method. A GET
(params in the `?data=` query) or an OPTIONS to any route runs it, mutations included. A browser sends
a GET from an `<img src>`, a link or a form with the user's cookies and no preflight, so any site can
fire any mutation of a cookie-authenticated app. A `<form>` POST with a `text/plain` body holding JSON
may run too, if the server never checks the content type (to verify).

## Direction

Every decision below was settled with the maintainer. The implementer still plans the details
(file layout, adapter wiring, test placement), never the decisions.

### Boundaries

- CORS is an ordinary middleware, added to an API or not. An API that does not add it gets no CORS
  headers. Nothing CORS-shaped joins the router's own chain.
- The router gains only what the middleware cannot do without: the HTTP method on the request, ending
  a chain early with no error, and the per-route allowed methods (which also close the security hole
  above).
- The router stays RPC-first: it routes by path. The method check is one number test per request,
  never a per-method route table.

### 1. The HTTP method on the request

`MionRequest` (`packages/rpc-router/src/types/context.ts`) gains `readonly method: string`, uppercase,
filled by every adapter (node, bun, uws, cloudflare, vercel, aws, gcloud). `dispatchRoute` and
`createCallContext` default it to `POST`. A preflight is `method === 'OPTIONS'` plus an
`access-control-request-method` request header.

### 2. Ending a chain early with no error

Only a failure ends a chain today (`packages/rpc-router/src/dispatch.ts`, the
`response.hasErrors && !executable.alwaysRun` skip in both chain runners). `mionFetchMetadata` fakes an
early answer with a `FatalError` carrying status 200.

- New exported helper `endChain(ctx, statusCode = 200)`.
- `MionResponse` gains a public `readonly endedEarly: boolean`, so a logger can tell why the chain stopped.
- One internal flag, `response.stopped`, is set by both a failure (`markResponseFailed`) and `endChain`.
  The loop reads only that flag, so the check costs the same as today:

  ```ts
  if (response.stopped && !executable.alwaysRun) continue;
  ```

- `hasErrors` keeps its meaning: an error happened. `endChain` on a chain that already failed changes nothing.
- `alwaysRun` means always: every `alwaysRun` member runs after an early end exactly as after an error,
  `mionFetchMetadata` and the serializer included. One that fails there (a required param on an empty
  preflight body) is the developer's to handle.
- The answer is the status code with the usual `{}` JSON body. Every adapter always writes a JSON body,
  so 200, not 204.

### 3. Allowed HTTP methods per route

- New route option `httpMethods` (named so because "methods" already means routes and middlewares in mion).
  Values: `GET`, `POST`, `QUERY`.
- Defaults by helper:

  | Helper | Default | Why |
  | --- | --- | --- |
  | `query` | `GET, POST` | read only; the client falls back to POST when the URL is too long |
  | `route` | `GET, POST` | it does not say whether it reads or writes; meant to move to `query` later |
  | `mutation` | `POST` | a write is never right over GET |
  | batch | `POST` | always one POST |

- `QUERY` (the draft HTTP method that reads like GET with a body) is accepted as a value, in no
  default. Node 26 lists it in `http.METHODS`; the other platforms are unchecked, so adding it to a
  default is separate work.
- Speed: each method gets a bit, and each chain stores its allowed methods as one number, built once
  with the chain. One test per request, after the path lookup that already happens, never per member:

  ```ts
  const METHOD_BITS = {GET: 1, POST: 2, OPTIONS: 4, QUERY: 8};
  if ((chain.methodBits & METHOD_BITS[method]) === 0) refuseMethod(...);
  ```

  An unknown method reads `undefined`, gives 0, and is refused.
- A refused method is recorded like a platform error (`dispatchPlatformError`): a `405`,
  `method-not-allowed` error with an `Allow` header, and the `alwaysRun` members still run.
- OPTIONS is accepted only by a chain holding mion's CORS middleware, and that middleware ends every
  OPTIONS request, preflight or not, so an OPTIONS never reaches a route. Any other chain refuses
  OPTIONS with the 405. Not-found chains answer 404 whatever the method.
- A request body whose `content-type` is one a plain HTML form can send without a preflight
  (`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`) or that is missing is
  refused with a `415`. First verify the server ignores the content type today.
- `httpMethods` rides the route metadata the client already downloads, and the client respects it:
  a query allowing only GET whose URL is too long fails in the client instead of POSTing.
- Breaking change: a mutation called over GET stops working. Say so in the changelog.
- Tests first: prove the hole (a GET and an OPTIONS running a mutation, the form-type POST) before the fix.

### 4. Which routes get CORS: placement decides

mion's normal middleware rule, no new setting. At the routes root it covers every route; inside a
group it covers that group. It goes first, before any headers middleware, because a preflight never
carries the app's own headers and an auth check would fail it:

```ts
const routes = {
  cors: mionCors({origin: ['https://app.example.com']}),
  mionFetchMetadata,
  auth: headersMiddleware(...),
  users: {...},
};
```

Routes outside it get no CORS headers, and the browser blocks a cross-origin call to them.

### 5. The middleware

- `mionCors(options)` returns an `alwaysRun` middleware, so CORS headers land on error answers too and the
  client can read the error. With the method on `MionRequest` it needs no raw request; a raw middleware is
  acceptable only if a factory cannot carry the build markers.
- On every request from an allowed origin: `Access-Control-Allow-Origin`, `Vary: Origin`, and with
  `credentials` `Access-Control-Allow-Credentials` (the caller's origin echoed, never `*`). On a normal
  request also `Access-Control-Expose-Headers`.
- On a preflight also `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`,
  `Access-Control-Max-Age`, then `endChain(ctx)`.
- Origin not allowed: a preflight still ends early, with no CORS headers, so the browser blocks the call.
  A normal request runs with no CORS headers: CORS guards browser reads, it is not a server lock.
- Options:

  ```ts
  mionCors({
    origin: string | string[] | RegExp | ((origin: string) => boolean),
    credentials?: boolean,
    maxAge?: number,          // seconds the browser caches the preflight answer
    allowHeaders?: string[],  // extra request headers a raw middleware reads
    exposeHeaders?: string[], // extra response headers a raw middleware sets
  });
  ```

### 6. The header lists, derived per chain

Each request knows its chain (`ctx.executionChain`). The middleware builds the lists from that chain's
members on first use and caches them per chain (a `WeakMap` keyed by the chain). A batch request has its
own merged chain, so it works the same. Adding a header to a route needs no CORS edit.

| CORS header | Comes from |
| --- | --- |
| `Access-Control-Allow-Headers` | `content-type` + every `headersParam.headerNames` in the chain + `allowHeaders` |
| `Access-Control-Expose-Headers` | every `headersReturn.headerNames` in the chain + `x-rpc-error`, `x-build-version` + `exposeHeaders` |
| `Access-Control-Allow-Methods` | the chain's `httpMethods` |

Headers marked `cors: false` (section 7) are removed last, after every merge (derived lists, hand-written
extras, batch unions), so nothing adds one back.

Unlike other frameworks, which expose nothing until you list it, mion exposes what routes declare,
because it can read them. The opt-out lives in the types.

### 7. `cors: false` in `HeadersSubset`

All the information stays in the types. `HeadersSubset` carries the mark but never acts on it; only the
CORS middleware reads it. A third type parameter, an options object that exists only in the type:

```ts
interface HeadersSubsetOpts<Names extends string> {
  /** false: none of these headers cross origins; a map: only the names set to false */
  cors?: false | {[K in Names]?: false};
}

export class HeadersSubset<
  Required extends string,
  Optional extends string = never,
  Opts extends HeadersSubsetOpts<Required | Optional> = {},
> {
  readonly headers: {[K in Required]: string} & {[K in Optional]?: string};
  /** Type only, never set at runtime: read from the compiled type */
  declare readonly opts?: Opts;
}

// one name off CORS
HeadersSubset<'authorization', 'x-debug-node', {cors: {'x-debug-node': false}}>
// the whole subset off CORS
HeadersSubset<'x-debug-node' | 'x-trace-id', never, {cors: false}>
```

- Existing types do not change: the parameter defaults to `{}`. A typo in a name is a type error.
- Both directions: on a route return, the name stays out of `Expose-Headers`; on a headers middleware
  param, out of `Allow-Headers`.
- Header names are read from the compiled class type (`getHeaderNamesFromRunType`,
  `packages/core/src/runtypes/mionAdapter.ts`), by walking its `headers` property. The same walk reads
  `opts.cors` into the server's header metadata next to `headerNames`. The client does not need it.
- Verify first, with a small test: the compiled class type includes the never-set `declare` property;
  validation passes with it absent at runtime; how much the type ids change (Go resolver golden fixtures)
  and the type-budget cost of the third parameter.
- Security: it is a privacy tidy-up, not access control. The header is still sent, and only allowed
  origins ever see exposed headers. Say so on the docs page.

### Speed

Run the router dispatch benchmarks (`packages/rpc-router/src/routes/dispatch.bench.ts`,
`dispatchNoAwait.bench.ts`) before and after, and put the numbers in the PR.

## Docs

- New page `container/website/content/01.rpc/03.middlewares/03.cors.md`, named after the export without
  the `mion` prefix: placement, options, derived lists, `cors: false`, what CORS does and does not protect.
- `container/website/content/01.rpc/02.server/02.middleware.md`: the intro line listing CORS as your own
  work points at the new page; `endChain` and `endedEarly` documented with `alwaysRun`.
- `container/website/content/01.rpc/02.server/01.routes.md`: `httpMethods`, its defaults per helper, and
  why a mutation is POST only.
- `container/website/content/01.rpc/02.server/04.headers.md`: the `HeadersSubset` options parameter.
- `container/website/content/01.rpc/02.server/03.call-context.md`: `request.method`, `response.endedEarly`.
- `container/website/content/01.rpc/02.server/05.error-handling.md`: `method-not-allowed` (405) and the
  refused content type (415).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The middleware is added to an API like any other, and an API that does not add it gets no CORS headers.
- `endChain` ends a chain with a successful answer and no error; `alwaysRun` members still run after it.
- A preflight is answered without reaching a route and without an error.
- An app turns CORS on by stating its origin policy plus anything its raw middleware set by hand.
- The allowed and exposed header lists come from what the routes declare, so adding a header to a
  route needs no CORS edit; hand-written names merge with them, and `cors: false` names never appear.
- A route returning a `HeadersSubset` works from a browser on another origin, which it does not today.
- Each route accepts only its `httpMethods`; a mutation over GET, an OPTIONS outside a CORS chain and
  a form-type body are refused, each proven by a test written before the fix.
- Dispatch benchmark numbers before and after are in the PR.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
