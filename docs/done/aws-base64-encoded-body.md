---
type: fix
spec: guidelines
status: done
created: 2026-09-11
---

# AWS adapter ignores isBase64Encoded

## Intent

`awsLambdaHandler` (`packages/platform-aws/src/awsLambda.ts:51`) takes the body as `rawRequest.body || ''` and always treats it as JSON text. API Gateway and Lambda Function URLs set `isBase64Encoded: true` and base64-encode the body for binary media types and for some proxy setups, so such a request reaches the router as base64 text and fails with `parsing-json-request-error` instead of being served. The only mention of the flag in the package is a fixture in `awsLambda.spec.ts:59` that sets it to `false`. Found while surveying how every adapter reads the request body; it predates the per-route size limit work.

## Direction

- When `isBase64Encoded` is true, decode the body (`Buffer.from(body, 'base64').toString()`) before it is handed to `createCallContext`; the size check in the router must see the decoded text.
- Decide what a decoded body that is not valid UTF-8 JSON answers (the router's existing parse error is fine); a byte body has no encoder in mion (`getRequestBodyType` throws for `ArrayBuffer`), so do not pass bytes through.
- Check the response side too: `reply()` in the same file must set `isBase64Encoded` only if it ever returns bytes (today it returns text, so probably a no-op, but confirm).
- Pin with tests in `packages/platform-aws/src/awsLambda.spec.ts`: a base64 event round-trips the same as its plain twin, `isBase64Encoded: false` is unchanged, and a base64 body over the route limit is still a 413.
- The implementer plans the details.

## Done when

A base64-encoded event is served exactly like the plain one, the flag is covered by paired tests, and the AWS platform page in `container/website/content/01.rpc/` mentions binary and base64 bodies in one line if the behaviour is user-visible.

## Plan (approved 2026-09-11, delegated session)

- `awsLambdaHandler` reads the body through a new `decodeEventBody(rawRequest)` helper: when `isBase64Encoded` is true and the body is non-empty it returns `Buffer.from(body, 'base64').toString()`, otherwise the body as-is. The decoded text is what reaches `decodeQueryBody` and `dispatchRoute`, so the router's `maxBodySize` check measures the decoded text.
- A body that is not valid base64 or not JSON gets the router's existing `parsing-json-request-error`; `Buffer.from(..., 'base64')` never throws, so the adapter has no new error path.
- Response side confirmed a no-op: `reply()` only ever returns text (`stringifyJson` or `JSON.stringify`), so `isBase64Encoded` stays at API Gateway's default (false). A comment records that.
- Tests in `awsLambda.spec.ts`: a base64 event round-trips identical to its plain twin (two routes), `isBase64Encoded: false` is unchanged, a base64 body that is not JSON answers the parse error, and a decoded body over `maxBodySize` is a 413 while a short body whose base64 form alone is over the limit is served.
- Docs: one tip on the AWS Lambda platform page.
