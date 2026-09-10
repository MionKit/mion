---
type: feature
spec: full-plan
status: done
created: 2026-09-10
---

# One way to read a url query parameter

## Problem

Two hand-written scanners read the same query string, each looking for exactly one parameter and
unaware of the other:

| Parameter | Where | How | Decodes? |
| --- | --- | --- | --- |
| `id=` | `readBatchId` in `packages/router/src/batches.ts` | `urlQuery.split('&')`, allocates an array per request | yes, `decodeURIComponent` in a try/catch |
| `data=` | `extractDataParam` in `packages/router/src/lib/queryBody.ts` | `startsWith` + `indexOf` + `slice` | no |

Two implementations means two sets of rules that can drift apart, and a third parameter would mean a
third scanner.

## Decision

One router-internal function is the only place that knows how a query string splits:

```ts
// packages/router/src/lib/urlQuery.ts
export function findMionQueryParam(urlQuery: string | undefined, name: string): string | undefined;
```

- **Values come back raw.** No percent-decoding, no `+` to space. A consumer that needs a decoded
  value decodes itself, which keeps every existing behaviour byte-identical: `readBatchId` keeps its
  own `decodeURIComponent`, and `data=` stays raw because base64url is url-safe and `?data=abc%41`
  must keep failing as `invalid-query-body` rather than quietly decoding.
- **A parameter written without a value reads as `''`**, an absent one as `undefined`. First
  occurrence wins on a repeat. An empty name (`?=x`) never matches, so a hostile query cannot answer a
  lookup for `''`.
- **Not exported.** `ctx.urlQuery` is internal plumbing, nothing outside the router reads the query
  string, so the reader stays inside `packages/router`.

### Why one function and not a record on the context

A `Record<string, string>` of every parameter, built once per request, was measured and is the slower
option (best of 7 rounds of 200k, against what each request shape pays today):

| Request shape | today | one shared lookup | a record built per request |
| --- | --- | --- | --- |
| plain POST, no query | 2.7 ns | 3.0 ns | 2.5 ns |
| GET query route, 4 KB `?data=` | 150 ns | 183 ns | 262 ns |
| batch, `?id=three` | 295 ns | **279 ns** | 431 ns |

Separate lookups keep winning out to 8 parameters read from one query. A record would also have to be
built before `getExecutionChain` runs, since `readBatchId` is called while the context is still being
assembled. `Object.fromEntries(new URLSearchParams(q))` is 2 to 3 times slower than either and turns
`+` into a space, which nothing in mion does today.

A real dispatch is 3.0 to 4.4 microseconds, so the worst case above is under 1%, and the batch case
gets faster.

## What shipped

- `findMionQueryParam` backs both query reads. `readBatchId`'s `split('&')` loop and
  `extractDataParam` are gone.
- **gcloud kept only half a query string.** `?` is legal inside a query, so `split('?')[1]` dropped
  everything after a second one. `packages/platform-gcloud/src/googleCF.ts` now slices from the first
  `?`, matching every other adapter.
- **Tests.** `packages/router/src/lib/urlQuery.spec.ts` (11 cases: absent, bare, repeat, `=` inside a
  value, prefix and substring names, empty name, raw values, `Object.prototype` names, next to a long
  `data=` payload), a `findMionQueryParam through a real dispatch` block in `dispatch.spec.ts` (4
  cases) and two cases in `googleCF.spec.ts`. The existing `readBatchId` cases in `batches.spec.ts`
  pass unchanged, which is the proof the decode did not move. The security fuzz suite, which already
  throws hostile query strings at dispatch, is green unchanged.
- **Benchmark.** `packages/router/src/routes/dispatch.bench.ts` gained three query-string lanes (no
  query, a 4 KB `?data=` against a cheap `echoText` route, a batch `?id=`), so a future regression in
  query reading is visible. The dispatch harness itself cannot resolve a change this small (its runs
  spread 5 to 8%), which is why the isolated numbers above are the ones that count.

## Out of scope

- **A record of every parameter**, on the context or anywhere else. Measured slower; revisit only if a
  consumer appears that reads many parameters per request, and re-measure first.
- **Adapters reusing the parsed query their host already has** (AWS's `queryStringParameters`,
  express `req.query`, `url.searchParams`). Each re-encodes today and the router splits again; skipping
  that needs care because the encode is what makes `readBatchId`'s decode cancel out. Its own spec.
- **AWS reporting an empty parameter record as `''` where other adapters give `undefined`.** Only
  visible through `ctx.urlQuery`, which is internal, and every reader guards with `if (!urlQuery)`.
- **Percent-decoding or `+` handling by default, and multi-value parameters.** Values stay raw and
  first-wins on purpose.
