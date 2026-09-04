---
type: feature
spec: guidelines
status: ready
created: 2026-09-04
---

# A routesFlow request names a flow by id; the chain is compiled into the server

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
  mapping, the from / to ids, the param index and the mapper key, under an id derived from that
  content (a hash, so the same flow written twice gets the same id and the id changes when the
  flow does). The call site gets its id injected the way markers get their type ids, so the client
  sends `flowId` with no encoding. Decide how much of a flow can be extracted statically (inline
  sub-requests are easy; ones assembled at runtime may not be) and make the build report what it
  cannot extract, since such a flow can no longer be sent at all.
- **The wire.** The flow id rides where the chain rode: on the routesFlow path, as a plain path
  segment or a plain query parameter, no base64. The `?data=` base64url body feature for `query()`
  routes stays as it is; only the routesFlow chain leaves the query string. This is a breaking
  change to the routesFlow wire, and that is fine; the client and the server ship together.
- **The server.** The table is registered at startup next to the mappers; a request resolves its
  chain by id (a Map lookup), builds the merged execution chain once per id (the existing builder,
  now keyed by id, with the `pathTransform` twist the audit added) and refuses an unknown id with a
  typed error before reading the body. The shape check, the mapper-key check on the wire and the
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

- Every `routesFlow([...])` call site gets a build-time id, the id-to-chain table is compiled into
  the server, and the client sends only the id.
- The server executes a known id and refuses an unknown one before reading the body; the query
  decode, the shape check and the count cap are gone from the routesFlow path.
- A flow the build cannot extract is a reported build error, never a silent runtime failure.
- The per-route request limit of a flow is read from its table entry.
- Tests cover extraction, id stability, lookup and refusal, the client end to end, and the fuzz
  lane's flow attacks; the website documents the new wire.
