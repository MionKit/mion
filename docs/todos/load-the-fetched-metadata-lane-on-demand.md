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
