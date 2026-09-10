---
type: feature
spec: full-plan
status: done
created: 2026-09-09
---

# Bundle the API's route metadata and validators into the client

## Problem

A mion client learned how to call a route by asking the server. On first use it fetched the route's
compiled validators and serializers, kept them in a browser store, and rebuilt them with
`new Function`. That is the right default for a client with no build step, but it costs a round trip
before the first call, needs a stored cache the app has to trust, and cannot run where dynamic code
is blocked (a strict Content Security Policy, an edge runtime).

The client already imports the API's type (`initClient<PublicApi<typeof routes>>()`), and a type id
is a content hash of the type's structure, so the build can produce the same metadata and the same
compiled functions the server holds and hand them to the client as real functions.

Three rules the feature keeps:

- The build is opt-in: nothing is emitted unless the build asks for it.
- The client ships strictly what it uses: only the routes and middleFns the program calls, plus the
  middleFns in their chains.
- The client's entries are functions only, whatever the program's `emitMode`: a client never
  serializes, so its bundle carries factories and nothing to evaluate.

## What shipped

### The option, in four spellings

`bundleApi: 'bundled' | 'mixed'`, absent by default, following `clientTsconfig` end to end: the
resolver option and the CLI flag `--bundle-api`, the tsconfig plugin key, `PluginOptions.bundleApi`
on the unplugin core, and the preset option on `mionVitePlugin` and `withMion`
(`packages/devtools/src/options.ts`, `toRunTypesOptions` takes the bundle options as its third
argument so the two presets cannot drift).

| value | at build | at runtime |
| --- | --- | --- |
| absent | the markers inject nothing, nothing is emitted | fetched, unchanged |
| `bundled` | every dispatch site gets its route's module | no metadata request, no store, no `new Function`; an id with no bundled entry throws `route-metadata-not-found`, naming the option |
| `mixed` | same | the bundled table is an allow-list: ids it lacks are fetched, a fetched answer never replaces a bundled one |

There is no `routes: 'all'`: a client bundles what it calls, nothing else.

`apiTsconfig` (`--api-tsconfig`, `api: {tsConfig}` on the presets) is the mirror of
`clientTsconfig`: the tsconfig of the separate project that declares the API. With it set, the
client build resolves every route's types in a second program opened over that tsconfig
(`internal/compiler/resolver/peer.go`, the peer-session machinery the batch source already used,
generalized), rooted at the API program's one `initRoutes(...)` call whose routes are exactly the
client's, so a different `lib` or strictness on the client side cannot change an id. Absent means
one program.

### The marker sits on the dispatch points

`InjectApiMetadata<Api, Id extends string = never>` (`packages/run-types/src/markers.ts`, a new
marker kind in `internal/compiler/marker`). `RouteSubRequest<PH, Id, RA>` and
`MiddlewareSubRequest<PH, Id, RA>` carry the route id and the API in their type
(`ClientRoutes` / `ClientMiddleFns` thread the key path down with the same join `getRouterItemId`
uses), and each dispatch method takes a trailing marker slot: `.call()`, `.typeErrors()`,
`.prefill()`, and a batch's `.call()` (whose marker names the union of its routes' ids).
`initClient` carries the mode-only anchor, so the runtime knows its lane without an option. The id
lives in the type, so it survives destructuring, aliasing and a subrequest stored in a variable.

### The API type carries each route's effective options

`RouteDef<H, RO, O>` and its siblings take the route's literal options and the router's
(`packages/router/src/types/definitions.ts`); the helpers return the merged literal
(`ResolvedRouteOptions` / `ResolvedMiddleFnOptions`, `types/resolvedOptions.ts`); `PublicRoute`,
`PublicMiddleFn` and `PublicHeadersFn` expose `options` and a `types` member
(`MethodTypes<Params, Return, Headers, Async>`) naming exactly the types each method was compiled
from, so the build never re-derives them through the client's view types.

### Go: the `apimeta` lane (`internal/compiler/apimeta/`)

Modelled on `requestbatch/`: a cheap textual pre-filter, then the brand on the resolved signature;
the marker's type arguments give the API and the id (a literal, a union of literals for a batch,
`string` for a widened helper, `never` for the anchor). The API type is walked once per checker and
root (`tree.go`: members in checker order, the `PublicApi` filter mirrored, options read as a
literal object), the route plus its execution chain selected the way `router.ts` composes it,
params / return / headers ids assigned under the checker that owns the types
(`Cache.AssignIDUnder`) and demanded for exactly the families the server's marker slots name.
Emission (`resolver/apigen.go`): one module per method under `<genDir>/api/m/`, one per site under
`<genDir>/api/s/`, and a self-contained client mirror of the demanded families under
`<genDir>/api/types/` rendered in `functions` mode whatever the program's own mode, built-in pure
fns included. The transform injects the site module's binding at the call (`ImportBinding` on the
replacement, the `rtapi:/` scheme relativized like `rtmod:/`) and the lane as a string at
`initClient`.

Diagnostics (`diagnostics/codes_apimeta.go`): MET001 unreadable API type (error), MET002 a route the
API does not declare (error), MET003 a widened id under `bundled` (runtime error), MET004 the same
under `mixed` (warning), MET005 the `apiTsconfig` program has no single matching `initRoutes`
(error), MET006 a non-literal option on a bundled method (warning).

### Manifests and `mion api-check`

Both builds write `<genDir>/api/manifest.json`: the server's (`kind: server`) from the program's
`initRoutes` calls, every public method with its type ids, families, options and chain (an id two
calls declare differently is listed as ambiguous); a bundled client's (`kind: client`) from the
methods it bundled, plus its lane and API pointer. `mion api-check --server-gen-dir --client-gen-dir`
compares them (`apimeta/manifest.go`, `cmd/mion/apicheck_cli.go`): exit 0 when every bundled method
matches, 1 with one line per mismatch, 2 when a manifest is missing or of the wrong kind. Two JSON
files, no network, the prerelease gate for a split deployment.

### Client runtime

`packages/client/src/lib/bundledApi.ts` registers a site's payload through the same reflection the
router runs at `initRoutes` (`getReflectionFromMarkers` / `getHeadersReflectionFromMarkers`), so a
bundled method looks like a fetched one to the rest of the client, hash for hash. Under `bundled`,
`fetchRemoteMethodsMetadata` throws `route-metadata-not-found` for an id the bundle lacks and the
store is never touched; under `mixed` only missing ids are fetched and a fetched answer is filtered
against the bundled ids.

### Related fixes, each in its own commit

- `getSerializableMethod` never copied `headersReturn`, so a route returning headers never gave them
  back to a fetched client.
- Optional parameter names reached the metadata wire as a union-tagged `[[1, "name"]]` instead of a
  plain string (`paramNames` is `string[]`, `''` for an unlabelled slot).
- An entry tuple registered once was never registered again after its cache entry was removed
  (`initFromTuple` trusted its processed-keys set; it now re-checks the registry).
- The built-in pure fns a bundled validator depends on were rendered in the session's emit mode, not
  the mirror's, so a client built from a `code`-mode program shipped them as code strings.
- The level split had made the wrong-content enrichment codes warnings, which silently stopped the
  enrich health check from failing on stale mirror content; a `Stale` catalog bit, read by both
  check gates like the `Completeness` bit, restores the contract.

## Tests

- Go: `apimeta` unit tests (discovery over every dispatch shape, the tree walk, selection and
  chains, each diagnostic), `resolver/apigen_test.go` (generation, transform, prune, both wire modes,
  the `apiTsconfig` peer program, manifests across two projects, the mirror's built-in pure fns),
  `apimeta/manifest_test.go` (compare, read, round trip), the marker coverage rule in both call
  shapes.
- `packages/client`: three vitest projects, the fetched lane plus `client-bundled` and
  `client-mixed`, each its own program and genDir, the two lanes each starting the test server in a
  process of their own (`test/lib/laneServer.ts`, a vite server over the lane's config, since the
  router's registries are process-wide and the server has to be the one the lane's program
  compiled). The bundled lane proves no metadata request, no store access, running with `Function`
  disabled, prefill and batch from the bundle, a returned `HeadersSubset`, and the named error for
  an unbundled id; the mixed lane proves the allow-list; a parity test compares every bundled
  method with the live server's own metadata answer, jit hashes included; type-level tests pin the
  id literal through nesting and the marker slots.
- `packages/router`: the merged options on `PublicApi`, `headersReturn` on the wire, plain optional
  parameter names.
- `packages/devtools`: a real vite build of a bundled client (`src/vite/bundledApiBuild.spec.ts`:
  the `api/` tree, a self-contained artifact with live factories and no code string, running with
  `Function` disabled, nothing without the option), the presets and option parity, and
  `test/compile-cli-mion.test.ts` driving `mion compile --bundle-api --api-tsconfig` and
  `mion api-check` through the three exit codes.
- Fuzzing: the `apiids` lane (`packages/run-types/test/fuzz/apiids/`), the real binary over a server
  project and a client project with a different tsconfig per generated data type: the server
  manifest agrees with the reflection marker, the client bundles exactly what it calls with no
  diagnostic, and `mion api-check` passes; a fixed negative control shows the check firing without
  the pointer. Registered in the `FUZZ` table, the soak choices and the CI sweep.

## Docs

`container/website/content/01.rpc/03.client/05.bundled-api.md` (the lanes, what counts as a call,
the API pointer, the release check), the security page, the Vite, Next.js and CLI pages, and the
runtypes configuration row for `emitMode`; examples under `packages/examples/src/client/` and
`src/codegen/`.

## Out of scope

- Reading the routes object literal instead of the type; the lane is type-driven on purpose, so a
  client holding only the API's declarations bundles the same way.
- Moving the batch lane onto the type-level id (the chain walk keeps working).
- Relaxing the `functions` emit mode for the server.
- Any change to the metadata route or the wire shape; the server keeps answering fetched and mixed
  clients.
