---
type: feature
spec: guidelines
status: done
created: 2026-09-04
---

# Per-route request size limits derived from the types

## Intent

One `maxBodySize` (256 KB) used to cover every route, on the router and on the node / uws / bun
adapters: generous for a route that takes a user id and too loose to be called secure by default.
The types already say how big a valid request or answer can be. Now every route resolves its own
request limit (its option, else a number derived from its types, else a much smaller router
default), the adapters read the body against that number BEFORE parsing, and the same rule caps
each answer.

## What shipped

- **A JSON maximum, computed at build time.** A new Go walk, `internal/cachegen/jsonsize`, returns
  the largest compact-JSON byte size a VALID value of a type can have and whether that is a true
  bound (plus the first unbounded member path, for a build hint or a lint rule). It is a sibling of
  the binary cold-start estimator, not a reuse of it: the binary estimate counts binary bytes with
  no property names and a typical-value bias, so it is not a safe floor for a JSON body. The four
  `binarySizing` knobs stay what they are (a buffer seed) and nothing was renamed: the todo's
  rename license went unused.
- **Per kind, at the worst case.** Strings count 6 bytes per UTF-16 unit (the `\uXXXX` escape
  form) and are bounded only by `length` / `maxLength`; arrays by `length` / `maxItems`; Map / Set
  by `maxSize` (new); numbers 24, booleans 5, Date 32, keys as their JSON literal, every optional
  member present, the largest union member. A plain string, array, Map, Set, record, `any`,
  RegExp, unbranded bigint, user class or recursive type is unbounded.
- **Emission.** The number rides a new trailing slot `jsonMaxBytes` on the reflection ROOT rows of
  the runtype bundle (`runtype/entries.go`, slot 21 of `RUN_TYPE_FIELD_KEYS`), a hole on nested
  rows and on unbounded roots so those rows are byte-identical to before. mion reads it off the
  params root it already injects (`paramsJsonMaxBytes` on the method reflection).
- **Resolution per route**, settled once at registration in `lib/bodyLimit.ts`: the route's
  `maxBodySize` option, else, when every chain member with params has a number (its own option or
  its params maximum), the keyed body `{"<id>":<params>,…}` at its largest times
  `maxBodySizeFactor` (router option, default 2, floor 64 bytes), else the platform adapter's
  `maxBodySize`, read when the request resolves. There is NO router-wide size any more: every
  adapter (node, uws, bun, cloudflare, vercel, aws, gcloud) takes `maxBodySize`, 128 KB by default
  (`DEFAULT_MAX_BODY_SIZE` in core), far under every platform's own ceiling. A route's option wins
  over everything mion controls, the adapter's number included; nothing mion does is clamped by
  the adapter's number. Internal routes take the adapter's number. Extra keys count against the
  limit whether or not `strictTypes` is on. The resolved number is written to the route's
  `options.maxBodySize`, so it rides the client metadata (filled with the adapter's number for an
  unbounded route when the metadata is read). A middleFn's `maxBodySize` is its own contribution;
  the metadata middleFn in every chain declares 4 KB so its unbounded `string[]` does not send
  every chain to the adapter's number.
- **One lookup per request.** A streaming adapter builds the real `CallContext` BEFORE the body
  (`createCallContext(path, urlQuery, rawRequest, reqHeaders, respHeaders)`, the one Map lookup),
  reads the body against `context.maxBodySize` (the chain's number, else the adapter's), then
  `dispatchWithContext(context, rawRequest, rawResponse, rawBody, bodyType)` attaches the body and
  runs the chain. `dispatchRoute(path, …)` keeps its signature for a caller that has the body and
  is the two steps in one. Node checks `content-length` and the chunk loop against the context's
  number and destroys the stream;
  uws passes it to `collectBody`; bun, cloudflare and vercel read the fetch-style body through
  `readBodyWithin` (core), which refuses a declared `content-length` over the limit before a byte
  is read and cancels a streamed body mid-flight the moment the running byte count passes it (bun
  also sizes its one server-wide native limit to the largest route limit at start); aws and gcloud
  receive an already assembled body from the platform, so only the router's check before parsing
  applies there. Batches sum their member routes' limits plus the envelope on the entry.
- **The bound is checked against the real serializer.** A fuzz lane (`jsonsize`,
  `test/fuzz/type/jsonSizeBound`) generates bounded types, compiles them, mocks values and measures
  both `JSON.stringify` and the compiled JSON encoder's output against the root's `jsonMaxBytes`;
  its first run caught the two wire envelopes the walk did not budget (the `[null]` root wrap of an
  `undefined` / `void` root and the flat union's `[index,` … `]` wrap), which the walk now counts.
  A Go test pins that the per-kind walk sizes every node `WalkGraph` reaches on a bounded graph.
- **No response side.** What a handler answers is the developer's responsibility: nothing measures,
  caps or reports a response size. The compiler still emits `jsonMaxBytes` on return roots (it is
  a generic RunTypes property of every bounded reflection root); mion reads it for params only. A
  lint that warns when a return type could exceed the platform's response ceiling is its own todo.
  Fixed on the way: a first error raised inside the serialize loop used to be lost.
- **New sugar and a new format family.** `List<T, MaxItems, MinItems = 0>` over `FormattedArray`;
  `formattedMap` / `formattedSet` with `minSize` / `maxSize` (type-first `FormattedMap` /
  `FormattedSet`, sugar `SizedMap` / `SizedSet`, value-first `map(k, v, {maxSize})` /
  `set(v, {maxSize})`), validated, mocked, printed by `mion convert` and folded by the id like
  `formattedArray`. The errors lane's class guard used to treat every class as a Date, which hid
  the new checks; it now guards Map / Set on their own class.
- **One global switch.** The build option `derivedPayloadLimits` on the mion presets (the resolver's
  `jsonMaxBytes`, also a tsconfig plugin key and the `--json-max-bytes` flag, on by default) turns the
  feature off: the compiler emits no slot 21 at all, so every route takes its option or the adapter's
  number. A disk-fingerprint input.
- **The platform's own request ceiling.** The four hosted adapters export their documented
  ceiling in bytes as a constant (`VERCEL_MAX_BODY_SIZE_CAP` 4.5 MB, `AWS_LAMBDA_MAX_BODY_SIZE_CAP`
  6 MB, `GOOGLE_CF_MAX_BODY_SIZE_CAP` 10 MB, `CLOUDFLARE_MAX_BODY_SIZE_CAP` 100 MB) and take it as
  the `maxBodySizeCap` option, overridable for a bigger plan or a vendor change; node, uws and bun
  have none. The router brings every limit it resolves (route option, derived, batch sum, the
  adapter's number) down to it, silently. A build-time diagnostic that tells the author about an option above the
  ceiling is its own todo; this PR ships no lint rule.
- **Docs.** The security page states the resolution order and the platform ceilings; the routes
  page has a Request Size section; the type-formats page has the Map / Set rows and the sized
  sugar; every platform page names its ceiling and how the limit is applied there.

## Deferred, each as its own todo

- Build-time diagnostics for an option or a return type above the platform's request or
  response ceiling, emitted by the resolver like mion's other rules.
- A diagnostic on any variable-length type without a maximum, fed by the walk's recorded
  unbounded path.
- A client-side pre-check that refuses an oversize call before sending it, from the
  `maxBodySize` the metadata now carries.
