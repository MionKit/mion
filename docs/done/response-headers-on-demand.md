---
type: feature
spec: guidelines
status: done
created: 2026-10-16
---

# Response Headers Built Only When Needed

## Intent

Every request builds a response headers object, even when no handler or middleware touches headers.
On Bun that is `new Headers(getResponseDefaults(...))` per request (`packages/platform-bun/src/bunHttp.ts`),
and the response serializer always writes `content-type` into it (`serializeResponseBody` in
`packages/rpc-router/src/routes/serializer.routes.ts`). Every adapter also sends `server: @mionjs`, and
users cannot turn the default headers off. On hello-world (Apple M2 Pro, 2026-10-16) mion.bun answers
123.8k req/s against hono.bun 147.0k and elysia.bun 222.9k; part of that gap is this fixed cost per request.

## Direction

The implementer measures first and plans the details.

- Build the headers object only on the first write. Until then the reply uses the frozen merged defaults
  that `getResponseDefaults` already caches. `content-type` is constant for JSON, so it can live in
  those defaults rather than be written per request.
- Writes can come from anywhere: `ctx.response.headers.set` in any handler or raw middleware, a returned
  `HeadersSubset`, the error path (`x-rpc-error`), Bun's `connection: close`. A lazy object must keep all of
  them working.
- Add a way to send no default headers at all (the `server` header included), per adapter or router-wide.
  The implementer picks the option name and where it lives.
- Known result: the Bun gap work tried a plain object instead of `Headers` for the reply. It was within noise
  and changed `Set-Cookie` and bad-value handling. Profile before building, and keep those behaviours.
- Check every adapter (node, uws, bun, cloudflare, vercel, aws, gcloud), not only Bun.

## Docs

`container/website/content/01.rpc/02.server/04.headers.md`, existing section "Headers on Every Response":
table row 4 (`server: mionjs` on every adapter) and one sentence that `content-type` is always JSON.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Repeated `pnpm miondevx bench servers repeat <lane> hello-world` runs show a gain on mion.bun with no
  regression on the other mion lanes, or the PR shows with profiles why there is none.
- All header writes still reach the response, proven by tests.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan: lazy headers bridge (approved 2026-10-16)

Decided with the user while planning:

- `server` becomes `mionjs` (was `@mionjs`), hardcoded and written by each platform at reply time, never part of
  the default headers. A `server` default or a handler-written `server` replaces it. No on/off option: the
  opt-out in the Direction above was dropped.
- `content-type` stays the serializer's call, like `statusCode`: the serializer and the fatal-error path set a
  new `response.contentType` field instead of writing a header, and each platform's reply writes it natively,
  last, so nothing overrides it.
- `x-build-version` moves out of the router's default headers in its own fix, merged before this one.
- No new caches: the existing `getResponseDefaults` cache stays.
- Bun first: prototype and measure hello-world there, then the other adapters. No fuzz test.

Build:

1. `getResponseDefaults` (`packages/rpc-router/src/router.ts`): no `base` param, names lowercased on merge (a
   `X-App` global plus an `x-app` adapter default is appended into `"a, b"` by `new Headers()` today).
2. A lazy `MionHeaders` bridge in `packages/rpc-router/src/lib/`: holds the frozen defaults record and nothing
   else, reads look at it, the first write creates the platform's store seeded with the defaults.
3. Per platform reply: untouched with no defaults = no headers object. bun / cloudflare / vercel pass the store or
   a module constant to `Response.json`; uws writes `server`, the store and `content-type` natively (its `server`
   is set after the defaults today, so it cannot be replaced); aws builds one result record; node / gcloud stay
   eager on `ServerResponse`, `content-type` written at reply.
4. Tests: the bridge alone; per adapter, every write source reaches the wire (handler `set`, returned
   `HeadersSubset`, `x-rpc-error`, Bun's `connection: close`), nothing leaks between requests, `server` can be
   replaced, `content-type` cannot, two `Set-Cookie` lines survive on fetch adapters.
5. Docs: "Headers on Every Response" table row 4.

## Plan revised in review (2026-10-17)

The first build (a lazy holder over the defaults, a WeakMap merge per adapter options object, one shared reply
`Headers`) was replaced after the user's review:

- One user option, the router's `responseHeaders` (was `globalResponseHeaders`). Every adapter's
  `defaultResponseHeaders` is removed: two places for the same headers, with a precedence rule, served nothing
  once `x-build-version` left them.
- Request data lives on the context: no WeakMap, no object shared by several in-flight requests. A pool is the
  one exception, and it holds unused headers only.
- `server` and `content-type` sit in that one defaults object after all (`server` first so the option replaces
  it, `content-type` last so it does not): the pool fills each headers object once, so writing them per reply
  saved nothing.
- Second review: the pools became module functions, like the rest of the router's state, and uws uses the
  router's record headers instead of its own copy of the class.

## What shipped

- `getResponseDefaults()` (`packages/rpc-router/src/router.ts`): one plain object merged by `initRouter`:
  `server: mionjs` first (the option can replace it), the `responseHeaders` option lowercased, then
  `content-type` last (it cannot). `resetRouter` puts back `server` and `content-type`. No WeakMap, no freeze.
- Each pooled headers class carries an `unused` flag: true after creation, any `set` / `append` / `delete`
  turns it off. `FetchResponseHeaders` (bun, cloudflare, vercel) wraps a native `Headers`;
  `RecordResponseHeaders` (uws, aws) is the record-backed `MionHeadersImpl` over a copy of the defaults.
- Two pools of unused headers in `packages/rpc-router/src/lib/headers.ts`: `getDefaultHeaders` /
  `releaseHeaders` for uws and aws, `getDefaultFetchHeaders` / `replyFetch` for the fetch adapters. Headers go
  back only if still unused (capped at 256). Each one remembers the defaults it was filled with: once the router
  starts again with others, the next take empties the pool.
- Node and gcloud take no pool: their headers object wraps that request's `ServerResponse`. Defaults are written
  with `setHeader`, except `content-type`, which the reply writes (a raw middleware ending the response itself
  must not send the JSON one).
- `MionResponse.contentType`, set by the serializer and the fatal-error path; every adapter writes it last.
- `server: mionjs` (was `@mionjs`). uws used to set it after the defaults, so it could not be replaced there.
- A `Headers` subclass carrying the flag was tried: its typings forbid overriding the methods, and `Response`
  is slower with one (720 vs 676 ns), so the flag sits on a small class wrapping a native `Headers`.

Measured on a Claude cloud host (noisy):

- `bunRequestHandler` with no socket (`packages/platform-bun/src/bunHttp.bench.ts`), best of runs against main:
  no header written 2.6 µs → 1.4 µs per request; a handler writing a header 2.7 µs → 2.15 µs. Before, building
  `Headers` from a record was about 22% of the handler's profile.
- `pnpm miondevx bench servers repeat <lane> hello-world`, main vs this branch interleaved, two rounds of two
  runs: mion.bun 50.8k-58.3k → 58.4k-68.5k req/s (about +15%); mion (node) 33.6k-38.2k → 34.7k-37.5k and
  mion.uws 56.4k-66.3k → 55.7k-64.9k, level within noise.
- Same bench after the review fixes: mion.bun 46.4k-58.7k → 57.1k-63.9k; mion (node) 33.8k-37.8k →
  35.3k-38.4k and mion.compact 36.4k-40.0k → 34.8k-39.7k, level within noise.
- After the second review, rebased on a newer main, on a slower host: mion.bun 19.1k-22.5k → 21.1k-25.5k;
  mion.uws 33.2k-36.4k → 36.9k-38.9k; mion (node) 12.8k-15.2k → 13.9k-15.1k, level. `bunRequestHandler` with
  no socket, three rounds: no header written 3.8-4.3 µs → 2.8-3.2 µs; a header written 4.7-5.0 µs → 4.3-4.6 µs.
