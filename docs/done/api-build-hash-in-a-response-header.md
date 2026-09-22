---
type: feature
spec: full-plan
status: done
created: 2026-09-22
---

# One API version, returned in a response header

## Problem

A client built with `bundleApi` carries compiled validators and serializers for the routes it calls.
It never asks the server anything, so when the server moves on (a route renamed, a param added, a
runtypes version bump) nothing notices. The client keeps calling with code compiled against an API
that no longer exists.

`mion api-check` catches this at build time, but only when both build outputs sit on the same
machine. A client already deployed against a server that changed afterwards has no check at all.

## What shipped

### One version for the whole API, injected at the call site

A new injection marker, `InjectBuildVersion<Api>`
(`packages/run-types/src/markers.ts`), beside `InjectBatchId` and `InjectApiMetadata`. Both ends
declare it as a trailing parameter over the same API type:

```ts
// packages/client/src/client.ts
initClient<RM extends RemoteApi>(options: InitClientOptions, buildVersion?: InjectBuildVersion<RM>)

// packages/router/src/types/mionRouter.ts
initRoutes<R extends Routes>(routes: R, buildVersion?: InjectBuildVersion<PublicApi<R>>): PublicApi<R>
```

The build walks the API type with `apimeta.WalkApi`, renders each method's `manifestRow()` (the same
fields `api-check` compares), sorts by id and hashes the lot into 12 base-62 characters
(`apimeta.BuildVersion`). Every row field is a compiled type id, so the value is a pure function of the
API's types: no build stamp, no timestamp, no counter. The discovery and injection live in
`ts-go-runtypes/internal/compiler/resolver/apiversion.go`; the manifest records the value the call sites
actually carry as `buildVersion`, read back from those sites rather than hashed a second time.

**One guard, not a setting.** A client build with neither `api.tsConfig` nor a router import in its own
program read the API under its own `lib` and strictness settings, so its ids can differ with nothing
wrong. Its slot stays empty, which both runtimes read as "no version".

Ambiguous ids never arise here. They only exist in `serverApiManifest`, which merges every
`initRoutes(...)` call of a program into one manifest; the marker hashes one call site's own API type.

**Both ends are checked against each other.** The client's API type is the author's to write, so a program
holding both an `initClient` and an `initRoutes` call is the one place the build can tell that what was
written is not what the router registered. Two different versions there are `MET007`, a `LevelRuntimeError`:
the code is written and runs, and reports a mismatch it should not.

### Server, on the wire

Two new `RouterOptions`:

- `globalResponseHeaders` (default `{}`), headers added to every response
- `apiVersionCheck` (default `true`), whether to send `x-build-version`

`initRouter` merges them once into a frozen record. All seven platform adapters read their own default
response headers through `getResponseDefaults(own, base)`, which merges them over that record once per
defaults object and drops every merge whenever the router is initialized again, so nothing is rebuilt per
response, no middleFn was added, and a second `initRoutes` cannot be answered from a stale merge. The
adapter's own `defaultResponseHeaders` wins on a clash. `BUILD_VERSION_HEADER` lives in `@mionjs/core` so
the client reads the name without a value import of the router.

### Client

`initClient` stores the injected version. After each fetch the client reads `x-build-version`: a missing
header, a missing build version, or an equal one all do nothing. A difference switches on per-route
verification, through the fetched lane behind `#metadata-from-server`. Both halves install the server's
rows and both run only once the bundle comes up short, so one chunk carries them; making that true meant
dropping the empty stub `bundleApi: 'bundled'` used to put in that lane's place, which had also left a
bundled client with no way to recover at all.

Only the comparison is in the first download. `lib/apiBuildVersion.ts` holds the injected value, the header
comparison and the one error slot `initClient` reads; everything a mismatch then does (which routes are
still unconfirmed, the sub request, the row comparison, the error text and the formats registry the
server's rows compile through) is in the lazily imported lane. A client that never meets a mismatch never
downloads it, and until one happens the request path does not even look. Pinned by
`src/bundleSplit.spec.ts`, which walks the entry's static imports and fails if any of it turns eager.

After a mismatch, each route is confirmed once on its first use. The question rides the request the client
was making anyway, as a `mion@methodsMetadata` slot, so there is no extra round trip and no server-side
filter. The server answers with what it declares now; the client compares its own row against that twin in
full, every field the build version hashes included, since a row is compared against its own copy instead
of the handful of ids a request had room for. A row that really differs is replaced with the server's, and
the mismatch is reported once as `api-version-mismatch` in the call's undeclared slot. A call that already
succeeded is never repeated; only a failed one is retried, so a mutation cannot run twice.

## Deviations from the original plan

- The server side does NOT ride `renderBatchesModule`: `generateRpc` removes `rpc/` and returns early when
  the program has no batch call, so an app without batches would get no module. The marker replaced both
  generated modules.
- The value is 12 characters, not 7. It fingerprints a whole API, where a collision would hide a real
  mismatch, so it is wider than the per-type ids it is built from.
- There is no build option, no CLI flag and no devtools option. The version is always injected; one router
  option decides whether the header goes out, and the client only checks what the server sent.

## Tests

- Go (`ts-go-runtypes/internal/compiler/resolver/apiversion_test.go`): an `initRoutes` site and an
  `initClient` site over one API inject the same literal; a changed param type moves it; two builds of one
  API agree; an untrusted client injects nothing; a filled slot is left alone; the manifest carries the
  same value.
  Two more: a program whose client and server disagree is reported as `MET007`, and a server alone is not.
- Router: `globalHeaders.spec.ts` (the merge, `apiVersionCheck: false`, the build filling the slot itself,
  frozen, cleared by `resetRouter`).
- Platform: every adapter has a `globalHeaders` spec asserting the router's headers ride the wire and that
  the adapter's own value wins on a clash; `mionHttp.spec.ts` also covers a not-found response.
- Client, both lanes (`test/bundled/apiVersion.spec.ts`, `test/mixed/apiVersion.spec.ts`): the client and
  the separately built test server agree on the same version; a match costs one request and leaves the
  fetch lane unloaded; no header changes nothing; after a mismatch a route is asked about once, on a
  request the client was making anyway, and not again; a row the server no longer agrees with is replaced
  and reported once.

## Out of scope

- **The fetched client's cache.** A client with no `bundleApi` has no build-compiled rows to correct.
  Storing the server's version beside its metadata cache and purging on change would replace today's
  guess-after-a-serialization-error, and is worth doing, but is a different change.
- **Making the header readable cross-origin.** Until mion can send `Access-Control-Expose-Headers`, the
  check does nothing for a browser client on another origin. Failing silent is what keeps that harmless.
