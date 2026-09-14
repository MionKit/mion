---
type: fix
spec: guidelines
status: todo
created: 2026-09-14
---

# The gcloud adapter's request limit is skipped for a body express already parsed

## The finding

On `@mionjs/platform-gcloud` a route's `maxBodySize` is not enforced when express has already
parsed the request body, which is the normal case for a JSON API. The limit only holds for a
request whose body reaches the adapter as a string.

`packages/platform-gcloud/src/googleCF.ts`:

```ts
let rawBody = rawRequest.body;
let reqBodyType: SerializerCode = typeof rawBody === 'string' ? SerializerModes.stringifyJson : SerializerModes.json;
```

When express parsed the body, `rawBody` is an object and `reqBodyType` is `json`. The router's
`rejectOversizedBody` (`packages/router/src/lib/bodyReader.ts`, called from
`deserializeRequestBody`) measures a string body, so an object body is never measured and the
request goes straight through.

This matters because the request limit is a denial-of-service guard: on this platform a caller can
send a body of any size to any route as long as it carries `content-type: application/json`.

## How to reproduce

`packages/platform-gcloud/src/googleCF.spec.ts` already builds a server with
`setGoogleCFOpts({maxBodySize: 50})` in the "a failed request still runs the alwaysRun middleFns"
suite. Send the same ~110 byte body twice:

| Request | Answer |
| --- | --- |
| body only, no `content-type` | 413, `request-payload-too-large` |
| same body plus `content-type: application/json` | 200 OK |

The second one should be a 413 as well.

## What it is not

Not caused by the failed-on-arrival change: `googleCF.ts` is byte-identical at that branch's merge
base and the branch never touched the file.

## Intent

The limit should hold on gcloud whatever shape express hands the body over in. Two obvious roads,
and the implementing agent should weigh them rather than take one on this doc's word:

- Measure the parsed body on this adapter before the chain runs (it has to be paid for somewhere,
  and an object has no byte length without re-serialising it).
- Read the declared `content-length` header, which express leaves intact, and refuse on that before
  handing anything to the router. Cheaper, and it matches how node and uws decide.

Also worth settling: whether `@mionjs/platform-aws` has the same hole (it hands the whole body over
too) and whether the router should refuse an unmeasurable body rather than let it pass silently.

## Done when

- A body over a route's limit answers 413 on gcloud with `content-type: application/json`, not just
  without it.
- A test pins both shapes, next to the existing suite.
- The docs say what the limit does on a platform that hands the body over whole, if the current
  wording on the security page turns out to over-promise.
