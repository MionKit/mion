---
type: feature
spec: guidelines
status: ready
created: 2026-09-04
---

# Per-route request size limits derived from the types, on the size estimator's own knobs

## Intent

Today one `maxBodySize` covers every route (256 KB, the router option and the platform's own).
That is generous for a route that takes a user id and far too loose to be called secure by
default. The types already say how big a request should be, and RunTypes already computes a
per-type wire size at build time to seed the binary buffer. The goal: every route gets a request
limit derived from that same computation (a configurable factor on top), a much smaller router
default when the types cannot say, and a manual override on the route for the few that need more.
One set of size parameters drives both the buffer seed and the limits, so they can never disagree.

## Direction

The implementer plans the details. What was checked:

- **Start from the existing estimator and its config, not a new walk.** Every route already
  carries `paramsBinarySizeEstimate` / `returnBinarySizeEstimate`
  (`packages/core/src/runtypes/mionAdapter.ts`, read from the entry tuple's `binarySizeEstimate`
  slot, `packages/run-types/src/runtypes/entryTuple.ts`). It comes from
  `ts-go-runtypes/internal/cachegen/typefunctions/binary_size_estimate.go`, a walk that already
  accounts for numbers, strings, arrays, tuples, records, Map, Set, optional fields, unions and
  temporals, and anchors the unbounded parts on four knobs, `SizeEstimateConfig`:
  `Bias` (0.8, min to max interpolation), `Items` (100, the assumed element count of an unbounded
  collection), `StringBytes` (32, the assumed byte length of an unbounded string) and `MaxBytes`
  (a per-subtree cap). Defaults live in `internal/constants` (`DefaultSize*`), the resolver session
  options carry them as `SizeBias` / `SizeItems` / `SizeStringBytes` / `SizeMaxBytes`
  (`internal/compiler/resolver/resolver.go`, wired in `render.go`) and all four fold into the disk
  cache fingerprint. Trace how they reach the session from the plugin / CLI options and document
  the user-facing names; today the estimate is documented only as a buffer seed.
- **The limit is the estimate times a factor**, or the same walk run at `Bias` 1 (every optional
  present, every collection at `Items`, every string at `StringBytes`), whichever the implementer
  finds more honest, times a configurable multiplier (a router option, something like 4x by
  default, since the estimate targets the typical value and the limit must never refuse a valid
  one). A type whose variable parts are all bounded (`maxLength` on strings, `maxItems` on arrays,
  `packages/run-types/src/formats/structural.ts` and `scalars.ts`) gives an exact maximum and needs
  no factor; the walk already reads those format bounds for the seed, so the same code decides
  "exact" against "assumed". The estimate counts binary bytes; decide whether the limit is checked
  against a JSON body as is (a JSON encoding is rarely smaller than the binary one, so the binary
  number times the factor is a safe floor) or whether the walk gains a JSON mode.
- **Make the parameters match, and rename freely.** The seed and the limits must read the SAME
  four knobs; if the names are too binary-specific for what they now mean, rename them once, end
  to end (constants, session options, protocol, the tuple slot `binarySizeEstimate`, the route
  metadata fields, the docs). Breaking changes are fine here; the tuple slot is a wire format
  between resolver and runtime, so bump whatever fingerprint or version guards it.
- **Resolution order, per route:** the route option, else the type-derived limit, else the router
  default. The router default drops from 256 KB to about 20 KB. The platform's own `maxBodySize`
  stays the outer cap on the read itself (node stops the stream, uws and bun have their native
  limit) and the router applies the per-route number once the route is known, where the body limit
  is checked today (`rejectOversizedBody` in `packages/router/src/routes/serializer.routes.ts`).
  The body carries the route id key, the params array and any middleFn params, so the limit is
  the sum of the chain's parts plus the envelope; a routesFlow body is the sum of its routes.
- **The adapters need the number BEFORE they read the body**, or the per-route limit never stops
  a read early and only the router's late check applies. Today every adapter resolves nothing until
  `dispatchRoute` looks the route up from the path (`acquireCallContext` in
  `packages/router/src/callContext.ts` builds the execution chain). Add a router function that
  resolves a request up front from what the adapter already has before the body (the path, the
  query string, the headers): it returns the execution chain, the resolved request limit and
  whatever else the dispatch needs, and `dispatchRoute` takes that resolved handle instead of the
  path so the lookup is done ONCE per request, never twice. Every adapter (node, uws, bun,
  cloudflare, vercel, aws, gcloud) calls it first, applies the limit to its own read where it can
  (node's chunk loop and `content-length` check, uws `collectBody`, bun's `maxRequestBodySize`
  is per server so bun and the fetch-style runtimes apply it after the read like the router check
  today), then dispatches. An unknown path resolves to the not-found chain with the router default.
- **routesFlow resolves from the query string, which arrives before the body.** A routesFlow
  request names several routes in `?data=`; the up-front resolution decodes that query (the
  routesFlow chain cache already keys on it) and the limit is the sum of the member routes' limits
  plus the envelope. When the query is missing or malformed the resolution returns the typed
  routesFlow error, and the adapter answers without reading the body at all. Measure the cost of
  decoding the query up front on the routesFlow bench (`packages/router/src/routes/routesFlowBuffer.bench.ts`),
  since it moves work from the dispatch into the adapter's first step; it should be a move, not
  an addition.
- **Route option** on `RemoteMethodOpts` (`packages/core/src/types/method.types.ts`), resolved
  like `strictTypes` / `sanitizeParams` (route option ?? computed ?? router option), and the
  resolved number published in the route metadata so the client can refuse an oversize call before
  sending (a later step, note it).
- **A default cap for unbounded collections and strings** is the same `Items` / `StringBytes`
  pair seen from validation: an optional RunTypes build setting that makes the validator refuse an
  array longer than `Items` or a string longer than `StringBytes` unless the type declares its own
  bound. With it on, the estimate at `Bias` 1 becomes an exact maximum for every type. Decide
  whether it lives in the RunTypes options only or is also a router option; keep the two limits
  apart in the docs (the byte limit refuses the body before parsing, the collection cap refuses a
  value during validation).
- **Return sizes** come from the same walk on the return type and would back a page-size cap on
  routes returning lists; the request side is the security win, ship that first and record what
  the return side adds.
- **Docs:** the website security page under the rpc server section carries the per-platform limits
  table today and must describe the new resolution order; the route options reference and the
  RunTypes options page get the (possibly renamed) knobs, described as one set of size parameters.
  `packages/examples/` gets an example of a bounded route and of the override.
- **Tests:** the limit walk pinned per kind on the Go side next to the estimator's own tests; end
  to end through `dispatchRoute` (a bounded route refuses a body one byte over its limit and
  accepts the maximum valid one, an unbounded route gets the router default, the override wins,
  routesFlow sums); the collection cap in the validator; the sechttp fuzz lane's fixture router
  picks up the new default automatically and its text-size attacks must keep passing.

## Done when

- Every route resolves one request limit: the option, else the type-derived number, else the
  router default, and the resolved number is visible in the route metadata.
- The seed and the limits read one set of size parameters, named for what they mean, with the
  rename carried end to end.
- The router default is lowered and documented; the platform limits stay the outer cap.
- A request is resolved once: the adapter gets the chain and the limit before reading the body
  and hands the same handle to the dispatch; the node and uws reads stop at the per-route number,
  and a routesFlow request resolves its limit from the query string. The router benches show no
  regression.
- A valid maximum-size request for a bounded route is never refused, pinned by tests on both sides.
- The collection cap setting exists (or the doc records why it was deferred), with its validation
  behaviour tested.
- The website documents the resolution order, the two kinds of limit and the size parameters.
