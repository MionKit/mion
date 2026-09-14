---
type: fix
spec: guidelines
status: done
created: 2026-09-14
---

# The gcloud adapter's request limit is skipped for a body express already parsed

## The finding

On `@mionjs/platform-gcloud` a route's `maxBodySize` was not enforced when express had already
parsed the request body, which is the normal case for a JSON API. The limit only held for a
request whose body reached the adapter as a string.

`packages/platform-gcloud/src/googleCF.ts`:

```ts
let rawBody = rawRequest.body;
let reqBodyType: SerializerCode = typeof rawBody === 'string' ? SerializerModes.stringifyJson : SerializerModes.json;
```

When express parsed the body, `rawBody` was an object and `reqBodyType` was `json`. The router's
`rejectOversizedBody` (`packages/router/src/lib/bodyReader.ts`, called from
`deserializeRequestBody`) measures a string body, so an object body was never measured and the
request went straight through.

This mattered because the request limit is a denial-of-service guard: on this platform a caller
could send a body of any size to any route as long as it carried `content-type: application/json`.

Reproduced before the fix with a 113 byte body against a 50 byte limit: 413 without a
`content-type` header, 200 OK with `content-type: application/json`.

## What shipped

The adapter now decides too-large before the chain runs, the way node and uws decide it.
`googleCFHandler` resolves the chain first (so it holds the route's own limit rather than the
platform default), refuses, and only then builds the context:

```ts
const resolved = resolveRequest(rawRequest.path, urlQuery, rawRequest);
rejectOversizedRequest(rawRequest, rawBody, resolved.maxBodySize);
```

`rejectOversizedRequest` reads three sources, cheapest first:

| Request shape | What is measured |
| --- | --- |
| a declared `content-length` (the normal case, express leaves it intact) | the declared number |
| chunked, so no declared length | `req.rawBody`, the exact wire bytes the Google functions framework keeps |
| neither, only a parsed object (a plain express host with no raw-body saver) | the body re-serialised |

A string body still falls through to the router, which measures it as it always did.

### The two questions the spec left open

**Measure the parsed body, or refuse on `content-length`?** Both, in that order. The declared
length is the primary road: it costs one compare, it refuses before any work, and it is how node
and uws already decide. It is not sufficient on its own, because a chunked request declares no
length and express still parses it, so the two byte-measuring roads back it up. Measuring is only
reached when there is no declared length.

**Does `@mionjs/platform-aws` have the same hole?** No. `awsLambdaHandler` builds its body with
`decodeEventBody`, which always returns a string, so the router's own check measures every aws
body. `packages/platform-aws/src/awsLambda.spec.ts` already pins a decoded body over the limit
answering 413. No aws change was needed.

**Should the router refuse an unmeasurable body instead of letting it pass?** No.
`dispatchRoute`, a batch call and the router's own tests all pass object bodies that never crossed
a wire, so refusing them would break callers that are not a denial-of-service risk at all. The
adapter is the only layer that still holds the wire size, so the check belongs there. The comment
on `rejectOversizedBody` was updated: it used to claim "the host that parsed it applied its own
limit", which is exactly the false premise this finding disproved.

### Behaviour change worth knowing

A 413 on gcloud is now answered before the execution chain runs, so its body carries the error
under `platformError` rather than under `mionDeserializeRequest`. That is what node and uws already
do for an oversized body, so gcloud is now consistent with them rather than with aws. The route's
middleFns, `alwaysRun` ones included, do not run for a request refused this way, again matching
node and uws.

## A second bug found on the same lines, fixed here too

The line right after the new check handed `rawRequest.body` to `decodeQueryBody`, which bails out
when a body is already present. express parses a request that carried NO body into an EMPTY object,
and an empty object is truthy, so `GET /api/route?data=<base64url>` never took the query-body road
on gcloud: it answered 422 with a validation error instead of running the call. Every other adapter
gets an empty string there and passes `rawBody || undefined`, so only this platform was affected.

Same root cause as the finding (express's parsed object is not "no body"), same function, so it is
fixed in this change with its own commit and its own test. `bodyOrUndefined` reports an empty
parsed object as no body, in one loop step rather than by building a key array.

## Tests

`packages/platform-gcloud/src/googleCF.spec.ts`, a new suite on a 50 byte limit. All three refusal
tests fail against the unfixed adapter:

- an over-limit body express left as a string
- an over-limit body express already parsed (the finding)
- an over-limit parsed body sent chunked, which declares no `content-length`
- a body under the limit still answers 200 in both shapes

And, next to the existing query-string tests, a `?data=` GET answering 200, which fails against the
unfixed adapter.

## Docs

`container/website/content/01.rpc/02.server/09.security.md` said Google Cloud Functions was "Same
as AWS Lambda: the platform hands over the whole body; the router checks it before parsing", which
over-promised once the body arrived parsed. The platform table row and the paragraph above it now
say that an adapter handed the whole body measures what arrived.
