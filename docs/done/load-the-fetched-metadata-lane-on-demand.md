---
type: chore
spec: guidelines
status: ready
created: 2026-09-13
---

# Load the fetched-metadata lane only when a client needs it

## Intent

A client that bundles its API never asks the server how a route works, never stores an answer, and
never rebuilds a compiled function. It still ships all of the code that does those things, and still
runs parts of it on the way to every call.

That is roughly 930 lines across six modules: the metadata request, the cache-into-store logic, the
store engines, eviction, persistence, and the storage helpers. Every one of them is a static import
of the client's request path, so a bundler has no way to drop them, and a bundled client pays for a
lane it is built never to use.

The point of bundling the API is a client that is smaller and starts faster. Shipping the fetched
lane alongside it gives back a good part of what the feature was for.

## Direction

Make the fetched lane an optional piece the client loads on demand, and let a bundled client never
reach for it. The implementer plans the details; this is the shape and the things already checked.

- **The lane is known before the first call.** The build writes a module that sets the mode, and it
  is imported into every file that starts a client, so the decision of whether the fetched lane is
  needed can be made at load time rather than per request.
- **What moves.** The fetch, the store, eviction, persistence and the storage helpers are the
  candidates. They are reached from the client's request path and from the client itself, so the
  seam is small in count but sits on the hot path.
- **What to be careful with.** Two client rules constrain the shape. A call never throws, so a
  dynamic import that fails has to arrive as an error in the result rather than as a rejection. And
  a refused cache write is reported once on a later call, which means whatever replaces the static
  import still has somewhere to put that.
- **The open question, and the interesting part of the work.** The request path reads a route's
  metadata out of the shared routes cache, and the bundled lane registers into that same cache. If a
  bundled client should not need the routes cache at all, the implementer has to decide where a
  bundled method's compiled functions live instead, and whether the request path can read them from
  there without a second road through the whole client. That is the design call this todo exists to
  make, not one to assume.
- **Mixed is the awkward case.** It bundles what the build saw and fetches the rest, so it needs
  both, and it is the case that decides whether "load on demand" is per client or per call.

## Done when

- A client built to bundle its API does not carry the fetched lane in its output bundle, and a build
  test proves it rather than a reading of the source.
- A client with no build step, and a mixed one, behave exactly as they do now, including the error
  that rides the undeclared slot when a cache write is refused.
- A call still never throws, whatever the loading does.
- The bundle size difference is recorded somewhere a later change would notice if it came back.

## What shipped (2026-09-19)

### The design calls this todo existed to make

**The open question, answered: bundled methods get their own table.** They no longer register into
core's shared routes cache. `packages/client/src/lib/methods.ts` holds them in a plain `Map` and
keeps a second shelf that the fetched lane fills with `routesCache` as it loads. The 16 read sites
across `request.ts`, `serializer.ts`, `validation.ts`, `sanitize.ts` and `headers.ts` used only three
operations, so they became `hasMethod` / `getMethod` / `useMethodFns`: one road with two shelves, not
two roads. A pure `bundled` client then never imports the routes cache, so core's hash lookup and
hydration merge leave the bundle with the lane.

**Mixed is per call, not per client.** A `mixed` client loads the lane on the first call that misses,
because the miss is what needs it. A `bundled` client refuses a method its build did not carry before
the lane is ever reached, so the refusal costs no load.

### How the lane leaves the bundle

`lib/fetchedLane.ts` is the one door, reached through `await import('#fetched-lane')` in
`lib/laneLoader.ts`. The specifier is a package.json `imports` entry of `@mionjs/client`, so it
resolves against that package and no consumer alias can collide with it. `"sideEffects": false` on the
client is load-bearing: without it the `export *` lines in `index.ts` keep the lane in every bundle
however lazy the request path is.

Under `bundleApi: 'bundled'`, `@mionjs/devtools` resolves `#fetched-lane` to
`src/core/fetchedLaneStub.ts`, so no chunk is emitted at all. Two things about that hook:

- The stub is a REAL FILE, not a virtual module. A `load` hook on the shared unplugin changes how
  esbuild and Bun read every other file too, and it broke the bun adapter's runtime-preload tests.
- The `resolveId` hook is declared ONLY when the option is `'bundled'`. unplugin turns a `resolveId`
  into an esbuild `onResolve` that sees every specifier, and merely declaring it broke the same tests.

Turbopack has no plugin API, so `withMion` adds a `turbopack.resolveAlias` entry pointing at the same
stub through the `@mionjs/devtools/fetched-lane-stub` export subpath.

### The related bug, fixed here

A `mixed` client wrote BUNDLED routes into IndexedDB. Two causes, both fixed:

1. The optimistic metadata subrequest asked for every id in the call, bundled ones included. It now
   asks only for ids the client lacks.
2. The server answers a metadata request for the route's WHOLE CHAIN, so a bundled middleFn rode the
   answer to a fetched route. The store now skips any id the bundle carries. Compiled functions that
   nothing points at are swept by the existing orphan sweep.

The dangerous half of that bug is gone by construction: with separate tables a hydrated row can never
occupy a bundled id, and `purgeHydratedMetadata` can never delete a bundled entry.

### Against the Done-when

- **Not in the output bundle, proven by a build test.** `packages/client/src/bundleSplit.spec.ts`
  runs a real `vite build` over the real client, with and without the option, and checks the artifact
  for `indexedDB`, the store key and `requestIdleCallback`. It fails when the stub is disabled.
- **No build step, and mixed, behave as before.** The existing fetched-lane and mixed suites pass
  unchanged, the refused-write error on the undeclared slot included.
- **A call still never throws.** `src/laneLoadFailure.spec.ts` mocks `#fetched-lane` into a failing
  import and asserts `metadata-lane-load-error` arrives in the undeclared slot. The load is awaited
  inside the request path's own try, so it is converted like any other prepare-time error.
- **The split is pinned by a test.** No byte counts recorded: the ask was a test that the split
  happens, not a size budget.

### New public surface

- `metadata-lane-load-error` on the undeclared slot, documented on the client's metadata cache page.
- `@mionjs/client` gains a `#fetched-lane` internal import and `"sideEffects": false`.
- `@mionjs/devtools` gains the `./fetched-lane-stub` export subpath.
