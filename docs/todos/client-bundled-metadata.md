---
type: feature
spec: guidelines
status: ready
created: 2026-09-04
---

# A client flag to bundle its route metadata at build time instead of fetching it

## Intent

The mion client learns how to call a route (validators, serializers, friendly errors) by fetching
that route's compiled functions from the server on first use and keeping them in localStorage.
That keeps bundles small and loads only what a page uses, and it stays the right default for a
client without a build step. But the front end and the back end are compiled by the same build,
which already sees every route the client code calls, so the client could just as well ship those
functions in its own bundle as real functions: no runtime code fetch, no cache to trust, no
`new Function`, first render never waits on metadata, and it runs on a runtime that blocks dynamic
code (a strict Content Security Policy, Cloudflare Workers). This matters more as the client grows
into generated UI that runs the same validation locally before hitting the server. The goal: one
client option that chooses bundled, fetched, or mixed (bundle what the build can prove, fetch the
rest), with the security cost of the fetched lane gone wherever bundled applies.

## Direction

The implementer plans the details. What was checked:

- **The build already tells client builds from server builds.** The devtools options
  (`packages/devtools/src/options.ts`) carry a client-side `serverMappers: {emit}` that harvests
  `serverMapFrom` mappers from the client bundle into a manifest under the client build's
  `.mion/types/` tree, and a server-side `{consume}` that reads it. The same client build is the
  place to learn which routes the client calls and to emit their functions; how the build sees the
  call sites (the typed `initClient<Api>()` and the `client.routes.x(...)` calls in
  `packages/client/src/client.ts`, or an explicit list in the option) is the implementer's call,
  and an explicit list is a fine first step when the call-site scan is not exact.
- **The functions exist in an eval-free shape already.** RunTypes emits `code`, `functions` or
  `both` (documented on the runtypes configuration page); the devtools reject `functions` for mion
  today only because the client story serializes code across the wire (`options.ts`, with the
  measured bundle cost of shipping functions: about +30% raw, +15% gzipped). A bundled client is
  exactly the case where real functions are wanted, so the rejection becomes "not with the fetched
  lane" rather than "never".
- **The client lane to keep and to bypass.** The fetch happens in `packages/client/src/request.ts`
  (`fetchRemoteMethodsMetadata`) and the cache in `lib/clientMethodsMetadata.ts`; bundled routes
  are registered at startup the way build-injected entries are and never reach either. In mixed
  mode the bundled set doubles as an allow-list: the fetched lane only accepts code for hashes the
  build could not provide, which closes the persistent-injection angle of the localStorage cache
  for everything the build saw.
- **The wire and the server do not change.** Bundled metadata is the same `SerializableMethodsData`
  the metadata route answers, shipped ahead of time; the server keeps answering the metadata route
  for the fetched and mixed modes.
- **Where the code is served from.** Bundled functions ride in the front-end bundle and deploy with
  it (the CDN or the static host), never from the API server; an option to emit them as one
  separate per-build file next to the front-end files is a natural variant, and the implementer
  should note whether it is worth a first cut.
- **Docs and tests.** The website client pages describe the three modes and when to pick each
  (default stays fetched), the security page under the rpc server section gains the client's side
  of the story (bundled: no eval, no cache), and the runtypes configuration page's `emitMode` row
  is corrected for mion. Tests: the client end to end against the test server in each mode, a
  bundled client that never issues a metadata request, the mixed mode refusing a fetched hash the
  build already provided, and a bundle built under a strict policy running with no `unsafe-eval`.

## Done when

- The client option exists with bundled, fetched and mixed modes, the default unchanged.
- A bundled client ships real functions for the routes it calls, issues no metadata request for
  them, evaluates no code string, and runs under a strict Content Security Policy.
- Mixed mode bundles what the build can see and fetches the rest, and the bundled set gates the
  fetched lane.
- The website documents the modes and their trade-offs; tests cover each mode end to end.
