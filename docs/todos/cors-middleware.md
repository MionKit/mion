---
type: feature
spec: guidelines
status: ready
created: 2026-09-22
---

# A CORS middleware configured from the declared headers

## Intent

mion has no CORS surface at all. `Access-Control-Expose-Headers` appears nowhere in the repo, and the
security page lists CORS under what stays the app's job
(`container/website/content/01.rpc/02.server/09.security.md:97`). The only examples that set any CORS
header do it through the generic `defaultResponseHeaders` knob
(`packages/examples/src/vercel/vercel-config.ts:5`).

That already breaks a shipped feature. A route returning a `HeadersSubset` is read back by name on
the client:

```ts
// packages/client/src/request.ts:553
responseHeaders.get(name)
```

Cross-origin the browser hides every non-safelisted header, so that returns `null` for every name,
`reconstructHeadersSubsetFromResponse` gives `undefined`, the client falls through to an empty body
slot, and no error is raised. A split client and server deployment, which is the normal mion setup,
silently loses returned headers today.

## Direction

A CORS middleware mion ships, configured from what the routes already declare rather than from a
hand-written header table. The implementer plans the details. The pieces to build on, all verified:

**Routes already declare their headers, in both directions.** A headers middleFn takes a
`HeadersSubset` param and a route can return one, and the serializer puts those in HTTP headers
instead of the body:

```ts
// packages/core/src/headers.ts:13
export class HeadersSubset<Required extends string, Optional extends string = never> {
  readonly headers: {[K in Required]: string} & {[K in Optional]?: string};
```

The router keeps those names per method (`headersParam` and `headersReturn.headerNames` on
`MethodMetadata`, `packages/core/src/types/method.types.ts:33` and `:80`) and every executable is
enumerable (`getAllExecutablesIds`, `packages/router/src/router.ts:294`). So the three lists CORS
needs can be derived, not configured:

| CORS header | Comes from |
| --- | --- |
| `Access-Control-Allow-Headers` | every `headersParam.headerNames` |
| `Access-Control-Expose-Headers` | every `headersReturn.headerNames`, plus the headers mion sets itself |
| `Access-Control-Allow-Methods` | `GET` for query routes, `POST` otherwise |

**The derived lists are a starting point, never the closed set.** A raw middleFn gets the platform's
own request and response, so it can read and set any header it likes, untyped and invisible to the
`HeadersSubset` types. The middleware has to take hand-written names and values too and merge them
with the derived ones, so an app can mix both. The origin policy is always the app's to state.

**`HeadersSubset` may need extending.** Some header should be declarable without being offered to
another origin, so the type probably needs a way to mark a name as not exposed. Settle that shape
before writing the middleware, since it changes a public type.

**A raw middleFn can reach the underlying request.** It is handed the platform's own request and
response objects, so it can answer a preflight outright:

```ts
// packages/router/src/types/handlers.ts:32
export type RawMiddleFnHandler<Context extends CallContext = any, RawReq = any, RawResp = any, ...>
  = (ctx: Context, request: RawReq, response: RawResp, opts: Opts) => MayReturnError;
```

**The HTTP method is missing from the context, and probably should be added.** `MionRequest`
(`packages/router/src/types/context.ts:46`) carries headers, the raw body and the parsed body, but
not the method and not the URL. A raw middleFn can dig the method out of the platform request, but
each platform shapes that differently. Putting the method on `MionRequest` once, filled by each
adapter, is the cleaner answer and makes this a normal middleFn rather than a raw one. That decision
comes first, because it widens a public type.

**Preflight has no route.** A browser sends `OPTIONS` with no body, naming a path that may or may not
be a route, and it must be answered before any route runs. Nothing in the repo handles `OPTIONS`
today, so where that answer is produced (the not-found chain, a raw middleFn, or the adapter) is the
other open question.

## Docs

`container/website/content/01.rpc/02.server/09.security.md` currently lists CORS under *What Stays
Your Job*; that line changes. The middleware itself needs a new section there, or its own page under
`01.rpc/02.server/`, decided once the shape is settled.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- An app turns CORS on through mion, stating its origin policy plus anything its raw middleFns set by
  hand.
- The allowed and exposed header lists come from what the routes declare, so adding a header to a
  route needs no CORS edit, and hand-written names merge with them rather than replacing them.
- A preflight request is answered without reaching a route.
- A route returning a `HeadersSubset` works from a browser on another origin, which it does not today.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
