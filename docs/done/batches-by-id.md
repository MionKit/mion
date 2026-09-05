---
type: feature
spec: guidelines
status: done
created: 2026-09-04
---

# A batch request names a batch by id; the chain is compiled into the server

## Intent

A routesFlow request lets a client combine routes and server-side mappings in one call. Today the
whole chain travels in the query string, base64url-encoded, and the server decodes it, checks its
shape, checks every mapper key and builds a merged execution chain per new combination. So any
caller can compose any chain of registered routes with any allow-listed mapper, every invented
chain costs the server a build, and the security audit could only cap the count (32 routes) and
check the shape. The flows an app really uses are written in its client code (`routesFlow([...])`),
and the build already reads client code to carry `serverMapFrom` mapper bodies into the server.
The goal: the build gives every defined flow a stable id and compiles the id-to-chain table into
the server; the client sends only the id, with nothing to encode, and the server executes the
chain it already knows or refuses the id. The chain never travels, so there is nothing to decode,
validate or cap on the wire.

## Direction

The implementer plans the details. What was checked:

- **First task: settle the naming with the user, before any code.** `routesFlow`, `serverMapFrom`
  and the routesFlow path name the mechanism, not the pattern, and they read as confusing. The
  pattern is a data loader: every entity has its own endpoint, and the front end resolves a
  relationship by mapping the output of one query into the input of the next (extract the ids from
  an entity, send them as the input of the next route), with the mapping step running on the
  server so the chain is one round trip. Discuss with the user a name set that says that (the
  feature, the client builder, the mapping helper, the wire path, the option names and the id),
  and only then rename end to end: client API, router, core, devtools transport, docs, examples
  and the test server. Breaking changes are fine; the old names do not survive as aliases.

- **Where flows are defined and decoded today.** `routesFlow(routeSubRequests)` in
  `packages/client/src/routesFlow.ts` builds a flow from sub-requests and `serverMapFrom(...)`
  mappings and the client encodes it as `?data=<base64url json>` on the routesFlow path
  (`WORKFLOW_PATH` in `packages/router/src/constants.ts`). The server side is
  `packages/router/src/routesFlow.ts`: `decodeRoutesFlowQuery`, the shape check
  `assertValidRoutesFlowQuery` (the trust boundary, with the 32-route cap), the mapper key check
  against `allowServerMapper` (`packages/core/src/runtypes/serverMappers.ts`), the merged chain
  builder and its cache keyed on the query. All of that becomes a lookup.
- **The transport already exists for mappers.** The devtools preset scans client bundles for
  `serverMapFrom` call sites and writes the mapper artifacts the server registers
  (`ts-go-runtypes/internal/compiler/resolver/generate.go`, the cross-bundle transport in
  `packages/devtools/src/core/unplugin.ts` and `protocol.ts`). The flow table is the same kind of
  artifact one level up: for each `routesFlow([...])` call site, the ordered route ids and, per
  mapping, the from / to ids, the param index and the mapper key. **The flow id is deterministic
  and depends only on the routes: a hash of the ordered route ids** (the same hashing the type
  ids use), nothing else. The same routes written at two call sites give the same id, the id is
  stable across builds, and it changes only when the routes change. The mappings are part of the
  table entry, not of the id, so two call sites that name the same routes with different mappings
  claim one id: the build reports that as an error (one flow, one mapping set) rather than picking
  either. The call site gets its id injected the way markers get their type ids, so the client
  sends `flowId` with no encoding. Decide how much of a flow can be extracted statically (inline
  sub-requests are easy; ones assembled at runtime may not be) and make the build report what it
  cannot extract, since such a flow can no longer be sent at all.
- **The wire.** The flow id rides where the chain rode: on the routesFlow path, as a plain path
  segment or a plain query parameter, no base64. The `?data=` base64url body feature for `query()`
  routes stays as it is; only the routesFlow chain leaves the query string. This is a breaking
  change to the routesFlow wire, and that is fine; the client and the server ship together.
- **The server keeps flows in their own table.** Flows are not routes: give them a dedicated
  registry next to the route table (`flatRouter` and friends in `packages/router/src/router.ts`),
  keyed by flow id, holding the ordered route ids, the mappings, the merged execution chain built
  once per id (the existing builder, with the `pathTransform` twist the audit added) and, later,
  the flow's request limit. It is registered at startup from the compiled table next to the
  mappers, reset with the router, and never mixed into the route lookup by path. A request
  resolves its chain by id (one Map lookup) and refuses an unknown id with a typed error before
  reading the body. The shape check, the mapper-key check on the wire and the
  count cap disappear, since nothing untrusted describes a chain any more; the mapper allow-list
  stays as the gate on what the table may reference. This also gives the per-route request limit
  its routesFlow answer for free: the limit of a flow is a property of the table entry.
- **Client side.** With the table known at build time, a flow that references a route or a mapper
  the server does not have is a build error at the call site instead of a runtime refusal; the
  metadata route can also list the flow ids so a hand-written client can still use them.
- **Docs and tests.** The website routesFlow page and the security page under the rpc server
  section describe the id, the build step and what is no longer possible; tests pin the extraction
  per call-site shape and the id derivation (devtools side), the lookup, the unknown-id refusal and
  the chain build per id (router side), the client end to end against the test server, and the
  sechttp fuzz lane's flow attacks turn into unknown-id and junk-id attacks that must be refused
  without work.

## Done when

- The feature, its client builder, its mapping helper, its wire path and its options carry the
  names agreed with the user, applied end to end with no aliases left.
- Every `routesFlow([...])` call site gets a build-time id hashed from its ordered route ids and
  nothing else, the flow table is compiled into the server and registered in its own registry
  apart from the routes, and the client sends only the id; two call sites with the same routes
  and different mappings are a build error.
- The server executes a known id and refuses an unknown one before reading the body; the query
  decode, the shape check and the count cap are gone from the routesFlow path.
- A flow the build cannot extract is a reported build error, never a silent runtime failure.
- The per-route request limit of a flow is read from its table entry.
- Tests cover extraction, id stability, lookup and refusal, the client end to end, and the fuzz
  lane's flow attacks; the website documents the new wire.

## Plan (approved 2026-09-05) and what shipped

Names settled with the user, applied end to end with no aliases: the feature is a **batch**
(`batch([...]).call()`, aligned with tRPC's and oRPC's batching word), the mapping helper is
**inputFrom** (`routes.users.getById(inputFrom(order, (o) => o.userId).asArg())`). The wire is
`POST /mion-batch?id=<batchId>`. The devtools option is `batches: {emit, consume, injectInto}` and its
artifacts are `.mion/batches.json` and `.mion/batches.generated.js`. The core mapper registry keeps its
logic under `inputMapper*` names (`allowInputMapper`, `registerInputMapperTuple`, ...) and the
`mionjs::` key namespace. `route.call({otherRoutes})` is dropped (one call shape for the build to read)
and the `@mionjs/no-vite-client` lint rule is removed (a client without the build plugin cannot send a
batch, so the rule's premise is gone).

- **Marker**: `InjectBatchId<Routes>` in `@mionjs/run-types`; `batch<Routes>(routes, batchId?)` declares
  it as its trailing parameter. The Go resolver discovers call sites by the brand (wrappers work, a
  filled slot is pass-through), reads each array element as a route call rooted at the client proxy
  (inline or bound to a const/let in scope), reads `inputFrom` arguments as mappings (inline lane key
  `rt::<hash>` shared with the pure-fn extractor, name lane `mionjs::<name>`), hashes the ordered route
  ids with `hashid.QuickHash` (no version salt: the id is a wire contract between two separately
  built artifacts) into `b_<hash>`, and splices the id at the call site like the pure-fn hash. What it
  cannot read is a build error (`BAT001` unreadable element, `BAT002` mapping source outside the
  batch, `BAT003` id collision, `BAT004` unreadable mapper, `BAT005` the same route twice,
  `BAT006` a mapping at a parameter the route does not declare).
  Sites ride the existing pure-fn report (`batchSites`), plus `types/batches-report.json` under the
  file flag.
- **Devtools**: `createBatchHarvest` writes the mapper sites and the batch sites into one manifest;
  the server build's generated module registers the mappers as today and calls `registerBatches(table)`
  from `@mionjs/router`; dev/serve installs lazy readers for both.
- **Router**: `batches.ts` holds its own registry (`registerBatches`, `getBatch`, `getBatchIds`,
  `clearBatches`, `installBatchReader`), builds the merged chain once per id (per tenant under
  `pathTransform`), keeps the mapper allow-list and arity checks, refuses an unknown or missing id with
  `batch-unknown-id` (404) while resolving the chain, before the body is read. The query decode, the
  shape check, the 32-route cap, the query-keyed cache and `maxRoutesFlowsCacheSize` are gone. The
  entry carries `maxBodySize`, read by the body-size check for batch requests. The metadata route lists
  the registered batch ids.
- **Client**: `batch()` throws `batch-missing-id` when no id was injected; the request path carries
  the id and nothing else; `mappings` moves onto the `SubRequest` interface.
- **Tests**: Go extraction per call-site shape and id stability; router lookup, refusal, chain build,
  tenant isolation, mapper gate; client end to end against the test server (both mapper lanes);
  devtools harvest, conflict error, generated module, rollup build; the sechttp fuzz lane's flow
  attacks become batch attacks (unknown, junk, missing id); pre-publish e2e consumer renamed.
- **Docs**: the client page becomes "Batch Requests" at `/rpc/client/batch`; the security page gets the
  batch-id row; devtools pages and examples renamed.

### Shipped (deviations from the plan)

- The Go extractor lives in `ts-go-runtypes/internal/compiler/requestbatch/` and rides the existing
  pure-fn report flags (`--pure-fn-report-wire` / `--pure-fn-report-file`, one knob for one
  transport); the id is `b_` + fourteen base64url characters of a sha256 digest over the route ids and the
  canonical mappings (the pure-fn key width), not version-salted. Sites reach the plugin through a new `onBatchReport` callback next to
  `onPureFnReport`, and `types/batches-report.json` under the file flag.
- The build reads a route only when its call is written inline or bound to a `const`/`let` WITH an
  initializer in the same file, rooted at `initClient()` (destructured `{routes}`, a renamed
  binding, `client.routes`, or a const chain such as `const users = routes.users`). A `let` filled
  later in a hook is a BAT001 error; the client specs were rewritten to const bindings for that.
- The id is hashed from the ordered route ids AND the canonical mappings, not from the routes
  alone as first planned: the same routes with different `inputFrom` mappers (different filters,
  say) is an everyday shape and is simply two batches. The only cross-site error left is a real
  hash collision (BAT003), checked by the resolver on whole-program paths and by the devtools
  harvest when it merges the per-file reports.
- The router keeps the merged chains on the batch entry, keyed by the `pathTransform`-resolved
  paths, so the audit's per-tenant isolation survives without a query-keyed cache. The
  `maxRoutesFlowsCacheSize` option is gone. The entry's `maxBodySize` is fixed on first use from the
  same number a plain route gets (platform limit, else the router option) and read by the body-size
  check; the per-route limit todo changes only that number.
- `route.call({otherRoutes})` was removed and the `@mionjs/no-vite-client` lint rule deleted, both
  agreed with the user.
- The metadata route lists the registered batch ids (`batches`) when all methods are requested.
