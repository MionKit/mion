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

## What shipped

- `packages/rpc-router/src/lib/responseHeaders.ts`: `LazyResponseHeaders`, the `ctx.response.headers` every
  adapter but node / gcloud hands the context. It holds the merged defaults and builds the adapter's store on the
  first `set` / `append` / `delete`. Before that, reads see `server` plus the defaults, as the store would.
  `fetchResponseHeaders` + `fetchReplyHeaders` serve bun, cloudflare and vercel: an untouched reply with no
  defaults reuses one `Headers` instance (`Response` copies it), built once. Any default header still builds the
  store at reply on those three.
- `MionResponse.contentType`, set by the serializer and the fatal-error path; every adapter writes it last.
- `server: mionjs` (was `@mionjs`) written by each adapter, first, so a default or handler `server` replaces it.
  uws used to set it after the defaults, so it could not be replaced there.
- `getResponseDefaults(own)` lost its `base` param and lowercases names on merge, into a PLAIN object: a
  null-prototype one stays in V8 dictionary mode, about 7x slower to walk (it cost node and uws 4 to 7% at first).
- Node and gcloud stay eager on `ServerResponse`: raw middlewares write it directly.

Measured on a Claude cloud host (noisy):

- `bunRequestHandler` with no socket (`packages/platform-bun/src/bunHttp.bench.ts`), best of runs: no header
  written and no defaults 2.6 µs → 1.85 µs per request; a handler writing a header 2.7 µs → 2.5 µs. Before,
  building `Headers` from a record was about 22% of the handler's profile. A frozen record passed to
  `Response.json` instead of a `Headers` gained nothing, which is why the earlier plain-object try was noise.
- `pnpm miondevx bench servers repeat <lane> hello-world`, before / after interleaved: mion, mion.uws,
  mion.compact and mion.bun level within noise. No gain on today's default mion.bun lane: the build's
  `x-build-version` is a default header, so every reply still builds headers. With `apiVersionCheck: false` (no
  default header) mion.bun goes 31.0k-31.6k → 34.6k-36.0k req/s, +12%. That fix has its own PR and
  merges before this one: it moves `x-build-version` into `mionFetchMetadata`, so every app without that
  middleware gets the gain, and an app using it still writes the header on every call.
- Not tested on workerd: its test fixture always carries a default header, so it never reaches the shared
  `Headers` path. The Fetch spec has `Response` copy its init headers; Node and Bun tests pin it.
