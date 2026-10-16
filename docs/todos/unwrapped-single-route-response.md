---
type: feature
spec: guidelines
status: ready
created: 2026-10-16
---

# Unwrapped Response for a Single Route

## Intent

A route's answer is always wrapped under its id: `GET /hello` sends `{"hello":{"hello":"world"}}`, where
hono and elysia send `{"hello":"world"}`. On a small response that is about a third more bytes, plus the
extra object. The request side already accepts the unwrapped form: a bare params array posted to a route
is read as that route's params (`deserializeRequestBody` in `packages/rpc-router/src/routes/serializer.routes.ts`).
The response has no such form. Find out whether it can, without a large architectural change, and whether
it pays off.

## Direction

The implementer investigates and plans the details. Constraints found so far:

- The wrapped shape carries more than the route value: middleware return values under their own ids,
  `@thrownErrors`, and several routes in a batch (`applyResult` in `packages/rpc-router/src/dispatch.ts`,
  `prepareBodyForJson` in `serializer.routes.ts`, `packages/rpc-router/src/batches.ts`).
- The client treats every top-level key as a method id (`deserializeJsonResponseBody` in
  `packages/rpc-client/src/lib/serializer.ts`). An unwrapped body today fails as `parsing-json-response-error`,
  or worse, is misread when the value's keys happen to match method ids.
- So the unwrapped form needs a clear signal on both sides. Possible shape: the client opts in per request,
  and the server unwraps only when the route is the only member with return data and nothing failed. The
  error path already sets an `x-rpc-error` header, which may be enough to tell the two shapes apart.
- Keep both parser modes (`json`, `compact`) and batches working. Compare bytes and req/s before and after.
- If it needs a large change, stop and write up the findings and options in the PR rather than building it.

## Docs

`container/website/content/01.rpc/02.server/03.call-context.md`, existing section "Request and Response
Format": the unwrapped form and when it is used. None if the investigation ends without a change.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Either the unwrapped response ships, with client and server tests for the single route, middleware data,
  errors and batches, plus bench numbers, or the PR explains why it should not.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
