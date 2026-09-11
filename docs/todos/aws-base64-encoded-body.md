---
type: fix
spec: guidelines
status: ready
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
