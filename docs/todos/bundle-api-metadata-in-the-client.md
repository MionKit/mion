---
type: feature
spec: full-plan
status: ready
created: 2026-09-09
---

# Build the API's route metadata and validators into the client from its PublicApi type

## Problem

A mion client learns how to call a route by asking the server. On first use it fetches the route's
compiled validators and serializers, keeps them in a browser store, and rebuilds them with
`new Function`. That is the right default for a client with no build step, but it costs a round trip
before the first call, needs a stored cache the app has to trust, and cannot run where dynamic code
is blocked (a strict Content Security Policy, Cloudflare Workers).

The client already imports the API's type: `initClient<Api>()` where `Api = PublicApi<typeof routes>`
(`packages/router/src/types/publicMethods.ts:38-49`). That type carries almost everything the client
needs, so the build can produce the same metadata and the same compiled functions the server holds,
and hand them to the client as real functions. What was verified:

- **Ids match.** A type id is a content hash of the type's structure salted only with the binary
  version (`ts-go-runtypes/internal/cachegen/runtype/serialize.go:565`): no paths, no tsconfig, no
  program identity. The same type resolved in the client yields the server's id, and when client and
  API share one program the resolved nodes are the same (measured on `packages/client`: 1090
  modules, byte-identical to the server's tree except the reflection facade).
- **Member order survives.** `PublicApi`'s `as` clause resolves to `never | Property`, assignable to
  the key, so the checker classifies it as filtering and keeps the declarations linked
  (`third_party/.../checker.go:26703-26712`): route ids, nesting and the middleFn chain order are all
  recoverable. `Prettify` has no `as` clause.
- **Handler types are fully modelled** from a type, no call site needed: `projectSignatureInto`
  (`cachegen/runtype/serialize.go:1464`) yields parameters with their labels and the return.
- **Literal object types are readable** through `comptimeargs.TypeLiteralObject`
  (`internal/compiler/comptimeargs/typevalues.go:37`), string literal types included.
- **A route call's type can name its route.** `ClientRoutes` already maps each API member to a
  function returning `RouteSubRequest<Handler>` (`packages/client/src/types.ts:234-240`); a second
  type argument holding the key path makes the id part of the type, so it survives destructuring
  and aliasing where a syntactic chain walk would not.

Two gaps, both small:

- Route options are captured as a literal at the helper and then dropped by its return type
  (`packages/router/src/types/mionRouter.ts:75-83`: `const RO`, returns bare `RouteDef<H>`). The
  client reads four of them (`encoder`, `isMutation`, `strictTypes`, `sanitizeParams`).
- One marker site resolves one type today (`protocol.Site.ID`, `internal/protocol/protocol.go:370`;
  `pendingCall.typeArgument`, `resolver/scan.go:364`). An API type holds many.

Three rules the feature sets:

- The build is opt-in. The marker on `initClient` is always declared by the client package, but
  nothing is emitted unless the build asks for it.
- The client emits strictly what it uses. An API can be far larger than one front end; only the
  routes and middleFns the program actually calls are bundled, plus the middleFns in their chains.
- The client's entries are functions only. Code strings exist to serialize functions to a client;
  a client never serializes, so its bundle carries factories and nothing to evaluate, whatever the
  program's `emitMode` is.

## Plan

### 1. The switch: a build option, off by default

`bundleApi: 'bundled' | 'mixed' | {mode: 'bundled' | 'mixed', routes?: 'used' | 'all'}` (absent =
today's fetched lane; `routes` defaults to `'used'`). One value, four spellings, following
`clientTsconfig` end to end: resolver `Options` and the CLI flag `--bundle-api`
(`cmd/mion/main.go:128,158`), the tsconfig plugin key
(`core/go-generated/tsconfig-plugin-keys.generated.ts:11`, regenerated), `PluginOptions.bundleApi`
(`core/unplugin.ts:92`, forwarded at `:494` and `core/resolver-client.ts:631`),
`plugin-option-keys.ts:14` for the parity test, and the preset option `bundleApi` on
`MionPresetOptions` mapped in `toRunTypesOptions` (`src/options.ts:173-221`), so vite and Next get it
in the same commit.

| value | at build | at runtime |
| --- | --- | --- |
| absent | nothing injected, nothing emitted | fetched, unchanged |
| `bundled` | the used routes (or all) from the API type | no metadata request, no store, no `new Function`; a route id not in the table is `route-metadata-not-found`, naming the option |
| `mixed` | same | the table is an allow-list: ids it lacks are fetched, a fetched answer never replaces a bundled one |

The mode rides inside the injected payload, so the client has no runtime option to keep in step.
The program's `emitMode` is untouched: the bundled entries are rendered with factories only, on
their own, and the server's `functions` rejection stays (`src/options.ts:189`), since the server
does serialize.

### 2. The marker

`InjectApiMetadata<Api>` in `packages/run-types/src/markers.ts` beside `InjectBatchId` (`:295`), the
precedent for a mion-only marker living there; a new `Kind` registered in `DefaultSpecs()`
(`internal/compiler/marker/marker.go:180`). `initClient<RA>(options, apiMetadata?: InjectApiMetadata<RA>)`
(`packages/client/src/client.ts:30`). With the option absent the scanner skips the site entirely.

### 3. The client's types carry the route id

- `RouteSubRequest<PH, Id extends string = string>` and `MiddlewareSubRequest<PH, Id extends string = string>`
  (`packages/client/src/types.ts`, the `SubRequest` family); the default keeps every existing use
  compiling.
- `ClientRoutes<RA, Prefix extends string = ''>` and `ClientMiddleFns` (`types.ts:234-252`) thread
  the key path down: a leaf becomes `(...params) => RouteSubRequest<Handler, `${Prefix}${Key}`>`,
  a sub-tree recurses with `${Prefix}${Key}/`, the same join `getRouterItemId` does at runtime
  (`packages/core/src/routerUtils.ts:292`).
- Nothing changes at runtime: the proxy still mints the id from the pointer (`client.ts:315-317`).
  The literal exists for the build, and as a bonus for the user's editor.

### 4. The API type carries its options

- `RouteDef<H, RO>`, `MiddleFnDef<H, RO>`, `HeadersMiddleFnDef<H, RO>` gain a second parameter,
  `options?: RO`, defaulting to today's wide interface so every existing use is unchanged
  (`packages/router/src/types/definitions.ts:18-46`; keep them flat, the comment at `:13-15` is
  about the instantiation budget).
- The helpers return the merged literal: `RouteDef<H, ResolvedRouteOptions<O, RO>>` and the
  siblings (`mionRouter.ts:74-127`). `ResolvedRouteOptions` reuses the encoder resolution that
  already exists at type level (`ParamsStrategy` / `ReturnStrategy`, `types/encoder.ts:26-52`) and
  adds `isMutation` (pinned by `query` / `mutation`, `lib/handlers.ts:32-45`), `strictTypes` and
  `sanitizeParams` (route literal, then router literal, then default), mirroring
  `router.ts:590-599`.
- `PublicRoute<H, Opts>`, `PublicMiddleFn<H, Opts>`, `PublicHeadersFn<H, Opts>` expose
  `options: Opts`; `PublicApi` forwards `Type[Property]` through an `infer` of the definition's
  second parameter (`publicMethods.ts:38-49`). `RemoteApi` (the loose type) stays as is.

### 5. Go: `internal/compiler/apimeta/` (new), modelled on `requestbatch/`

1. **Discover** `initClient` sites by the brand on the resolved signature (`isBatchCall`,
   `requestbatch/discover.go:36` is the template). Skip unless `Options.BundleApi` is set.
2. **Collect the usage set from types, not syntax.** For every call expression in the program,
   resolve its return type; when it is `RouteSubRequest` or `MiddlewareSubRequest` declared by
   `@mionjs/client` (`returnsRouteSubRequest`, `requestbatch/routes.go:90-105`, generalized), read
   the second type argument. A string literal is a used id; `string` means the call went through
   something that widened it (a generic helper) and yields **MET005** at that site, a warning that
   names `routes: 'all'`. Destructuring, `const users = routes.users`, a re-export, a subrequest
   stored in a variable, `.prefill()`, and a call inside a `batch([...])` array all resolve the
   same way, because the id is in the type. A client with no route call at all gets **MET003**
   (warning, naming `routes: 'all'`). The batch lane keeps its own chain walk for now.
3. **Walk the type argument.** Resolve `RA`; it must be an object type. Enumerate members in
   checker order (source order for a filtering mapped type), recursing into nested object members
   for sub-trees, producing pointer and nest level for every member; the chain composition needs
   the whole tree even when only part of it is emitted. Each leaf member is classified by its
   `type` literal property (`HandlerType`); `handler` gives the signature; `options` is read with
   `comptimeargs.TypeLiteralObject`. An `Api` that is `RemoteApi`, `any`, or a member the walk
   cannot read → **MET001**, an error: bundling needs the API's `PublicApi` type. No fallback, by
   decision.
4. **Select.** With `routes: 'used'`, keep the used ids plus every middleFn id in their chains (a
   middleFn a used route runs must be describable, or the client cannot validate or prefill it);
   with `'all'`, keep everything. A used id the type does not hold → **MET004** (error: the client
   calls a route its API type does not declare).
5. **Params and return, the two rules that keep ids equal to the server's:** the params tuple is
   `Parameters<handler>` as written; for a headers middleFn drop the first element, the
   `HeadersSubset` the server excludes (`HeaderHandlerParams`, `router/src/types/handlers.ts:78`).
   The return is `Awaited<ReturnType<handler>>` off `handler` itself, never through the client's
   view types: `HandlerErrors` adds a `ValidationError` arm the wire does not carry
   (`packages/client/src/types.ts:141`). Both types get `Cache.AssignID` (the walk in
   `enrichment/bridge.go:171-190` is the precedent) and are demanded as extra roots
   (`typefunctions.ExtraRoot`, `cachegen/typefunctions/module.go:173`) for the families the merged
   encoder names, exactly the set `MarkerSlots` computes for the server side
   (`types/encoder.ts:87-110`). In one program these ids already exist from the route sites; from
   a `.d.ts` they are created here.
6. **Fill the table** from the reflection nodes: `paramNames` and `paramsCount` from the tuple
   labels, `hasReturnData` from the return node, `headersParam` and `headersReturn` from the
   `HeadersSubset` walk (`mionAdapter.ts:424` is the JS twin), `isAsync` true (the public handler
   is always a promise), `paramsJitHash` / `returnJitHash` the assigned ids.
7. **Compose the chain** as `router.ts:305-460` does: ancestors' middleFns before, same-level
   middleFns before the route, the route, same-level after, ancestors' after; `PublicApi` has
   already dropped private and raw middleFns, and the router's own defaults are internal ids, so
   the public filter (`isPublicExecutable`, `types/guards.ts:56`) is the only one left to mirror.
8. **Emit** one module per site under `<genDir>/types/api/` through `entrymodules` +
   `materializeModules` (write-on-change, pruned when stale). The selected entries are rendered
   there in `functions` mode, factories and no `code` slot, whatever the program's `emitMode`, and
   the module exports `{mode, methods, entries}`. One `Replacement` at the trailing slot with
   `ImportFrom` set (`protocol.go:546`), the same road every marker site's binding takes.
   `TypeDeps` (`protocol.go:589`) names the declaring files, so an edit to a route re-runs the
   client file in every host with no new watcher; a new route call in another file changes the
   usage set, which the scan sees on the next generate the way a new batch does. A new `ApiSite`
   shape in `protocol.go` carries the many ids and demands; `Site` stays single-id.
9. **Diagnostics** registered with their scope, with a `NestedExample` where `ScopeGraph`, per the
   rule in `ts-go-runtypes/CLAUDE.md`: MET001 (unreadable API type or member), MET002 (a route
   name the router would refuse), MET003 (no route calls found), MET004 (a called route the type
   does not declare), MET005 (a route call whose id the type widened).

`mion compile` needs nothing more than the flag: same scan, same rewrite.

### 6. Client runtime

- `initClient` registers the payload when present: each entry through the path a marker call site
  uses (`getRTFunction`, `packages/core/src/runtypes/mionAdapter.ts:254-257`, on
  `initFromTuple`), then `addRoutesToCache(methods)` (`packages/core/src/routerUtils.ts:156`),
  which already refuses to overwrite, so the allow-list is free.
- `bundled`: skip `fetchRemoteMethodsMetadata` (`src/lib/fetchRemoteMethodsMetadata.ts:14`), skip
  `hydrateMetadataCache` and never persist (`src/lib/clientMethodsMetadata.ts`). `mixed`: fetch only
  ids the table lacks; the piggybacked payload is filtered against the table before `addToCaches`
  (`:461`).
- The related bug on this exact path, fixed here in its own commit: `getSerializableMethod`
  (`packages/router/src/lib/remoteMethods.ts:80-94`) never copies `headersReturn`, yet the client
  reads it (`packages/client/src/request.ts:579`), so a route returning headers never gives them
  back. The Go table carries it from day one and the parity test below would fail without the fix.

### 7. Devtools

`packages/client/vitest.config.ts` sets `bundleApi` on a second vitest project (or a scoped config)
so the bundled specs run against the same in-process test server.

## Tests

Go (`go -C ts-go-runtypes test ./internal/...`):
- `apimeta`: a nested tree with pre and post middleFns, a headers middleFn, a raw middleFn (absent
  from the type), per-route options and a router-level encoder, `query` / `mutation`; a
  `RemoteApi`-typed client; every diagnostic and its one-level-deeper twin.
- The usage scan: a direct chain, `const {routes} = initClient()`, `const {users} = routes`,
  `const {getById} = users`, a namespace import and a barrel, a subrequest stored in a variable
  before `.call()`, `.prefill()`, a call inside a `batch([...])` array, a helper typed with the
  concrete subrequest type (seen), a generic helper that widens the id (MET005, not bundled), a
  computed property access (not seen), no calls at all (MET003), a call the type does not declare
  (MET004).
- Marker coverage rule: paired `getRunTypeId<T>()` and `getRunTypeId(value)` tests where the suite
  touches the marker API.
- Generation: module on disk, relative imports, factories and no `code` slot under a `code`-mode
  program, pruned when the site or the option goes away, byte-identical across sessions, both wire
  modes, nothing emitted without the option, the module shrinks when a route call is removed and
  grows when one is added.

JavaScript (`pnpm test`):
- **Parity, the guard on the chain mirror:** the table injected for `initClient<TestServerApi>`
  with `routes: 'all'` deep-equals the live test server's own answer to `mion@methodsMetadataById`
  in its get-all form, method by method; with `routes: 'used'` it equals that answer restricted to
  the ids the client project calls plus their chains. Drift between Go and `router.ts` fails here.
- `packages/client`: the `Id` literal on `RouteSubRequest` and `MiddlewareSubRequest` for nested
  routes and for `middleFns` (type-level tests with `expectTypeOf`), existing call sites unchanged;
  each mode end to end; a bundled client issues no metadata request (`watchFetch`,
  `src/request.coldLoad.spec.ts:39`); a bundled client still works with `Function` replaced by a
  thrower, the strict-policy case in a plain node test; bundled mode neither reads nor writes the
  store; mixed mode fetches only ids the table lacks and drops a fetched entry for a bundled id;
  a bundled client calling a route it never named at build time gets the named error.
- `packages/router`: the helper return types carry the merged options (type-level tests), existing
  definitions unchanged; a route returning headers gives them back.
- `packages/devtools`: a real vite build over a temp fixture (the shape of
  `src/vite/batchesBuild.spec.ts`), the program left at the default `code` emit mode: the `api/`
  module on disk, the client chunk carrying factories and no code strings and none of the entries
  of an unused route, the artifact running with `Function` disabled; `test/mion-presets.test.ts`
  and `test/plugin-option-parity.test.ts` for the option; `test/compile-cli-mion.test.ts` for
  `--bundle-api`.

## Fuzzing

A requirement, not an option: the client and the server must assign the same id to every route's
params tuple and return type, or a bundled client encodes against one shape while the server
decodes another. The property is compare-to-a-trusted-source across two resolutions of one type:

- **Generator:** the existing random type generator (`packages/run-types/test/fuzz/core/typeGen.ts`,
  `GeneratedType`) rendered into a handler signature: a params tuple of one to four labelled
  elements, optional and rest elements included, and a return type, each element a generated type,
  plus a `HeadersSubset` first parameter for the headers-middleFn shape.
- **Two roads to one id:** a server file declaring `mion.route(handler)` and a client file calling
  `initClient<PublicApi<typeof routes>>()` under `bundleApi`. The server id is the `paramsId` /
  `returnId` the marker slot resolves; the client id is what the API walk assigns. Run once in one
  program and once as two programs where the client sees only the server's `.d.ts`, which is the
  harder case (the erased-import edge, the ambient declaration).
- **Oracle:** the four ids are equal, and the sets of demanded families are equal. Any difference
  is a failure with the generated source attached, the way the other lanes report.
- **Harness:** a new `apiids` lane beside `convertcli`, which already drives the real binary over a
  real temp project (`packages/run-types/test/fuzz/convert/convertRoundtrip.ts:170-190`), using
  `typeFuzzHarness.ts` (`renderFixture`, `openClient`) and `tsValidate.ts` to drop generated shapes
  that do not typecheck. Registered in `scripts/miondevx.mjs` with a quick and a soak iteration
  count like the other lanes, so it runs in `ci.yml`, `fuzz-soak.yml` and `release-gate.yml`.
  Designed with the fuzzy-testing skill at implementation time; this section fixes the property,
  not the code.

## Docs

- New page under `container/website/content/01.rpc/03.client/`: the three lanes, when to pick each,
  the `bundleApi` option and its `routes` choice, what "used" means (a typed call anywhere, a
  generic helper widens it), with a `<code-import>` example from `packages/examples/src/client/`.
- `01.rpc/02.server/09.security.md`: the client's side, bundled means no evaluated code and no
  stored cache.
- `01.rpc/06.devtools/02.vite.md`, `03.nextjs.md`, `04.cli.md`: the option and the flag.
- `02.runtypes/01.introduction/04.configuration.md`: one sentence on the `emitMode` row for what
  mion accepts on the server, and that a bundled client never needs it.

## Out of scope

- Reading the routes object literal instead of the type; the lane is type-driven on purpose, so a
  client holding only the API's `.d.ts` bundles the same way.
- A marker on `.call()` or on the route call itself; the id in the type covers every dispatch point
  without touching the proxy.
- Moving the batch lane onto the type-level id (a later cleanup; the chain walk keeps working).
- Relaxing the `functions` emit mode for the server.
- Any change to the metadata route or the wire shape; the server keeps answering for fetched and
  mixed clients.

## Done when

- `bundleApi` exists in all four spellings, off by default; with it absent the client package's
  marker injects nothing and the bundle carries no functions.
- With `bundled`, a client ships real functions for exactly the routes and middleFns it calls (or
  all of them with `routes: 'all'`), issues no metadata request, evaluates no code string, and
  runs with `Function` disabled; an unused route's entries are not in the bundle; the program's
  `emitMode` is irrelevant to it.
- A route call keeps its id through destructuring and aliasing, and a widened one is reported.
- With `mixed`, the bundled table gates the fetched lane and unbundled ids are still fetched.
- The API type carries each route's merged options; existing route declarations compile unchanged.
- The parity test passes over the whole test server, and the `apiids` fuzz lane runs green in the
  quick tier; a route returning headers reaches the client.
- Docs updated; `pnpm test`, `go -C ts-go-runtypes test ./internal/...`, `pnpm run lint` green.
