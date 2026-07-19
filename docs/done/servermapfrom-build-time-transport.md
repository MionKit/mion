# serverMapFrom: restore inline mappers via build-time transport (client → server bundle)

**Status:** done — implemented 2026-07-19 against local @ts-runtypes 0.10.0 (report feature
merged upstream in ts-run-types `docs/done/purefn-build-report-for-cross-bundle-transport.md`).
Full suite green: 1126 tests across all 4 CI batches, `failOnError: true` monorepo-wide.
**Created:** 2026-07-19

## Shipped (deviations from the plan below)

- `serverMapFrom(source, mapper, hash?)` (markers) + `serverMapFrom(source, name)` overloads
  in [client/src/routesFlow.ts](../../packages/client/src/routesFlow.ts); wire `bodyHash`
  is the FULL registry key both lanes (`rt::<hash>` / `mionjs::<name>`).
- Harvest rides `onPureFnReport` ('callback' mode — mion's manifest IS the artifact, no
  ts-runtypes JSON file needed); filter `calleeModule '@mionjs/client'` + `calleeName
  'serverMapFrom'`; manifest at `serverMappers.emit` path (client vitest config uses
  `packages/client/.mion/server-mappers.json`, gitignored).
- `virtual:mion/server-mappers` is served by mionVitePlugin in EVERY pipeline (inert empty
  module when `serverMappers.consume` unset — specs importing test-server keep resolving);
  generated code installs a lazy manifest re-reader (`installServerMapperReader`), so the
  dev race (server boots before client harvest) resolves on first mapping miss.
- Scanner-clean helpers in [run-types/src/mionPureFns.ts](../../packages/run-types/src/mionPureFns.ts):
  `registerMionPureFn` now writes through the raw cache (`addPureFn`), lookups ride
  `getPureFnByKey`/`hasPureFnByKey`, new `registerServerMappers`/`getServerMapper`/
  `hasServerMapper` (factory rebuilt `new Function(...paramNames, "'use strict'; " + code)`
  — parity with ts-runtypes `buildPureFnFactoryFromCode`).
- Router dispatch resolves `getServerMapper(bodyHash)`; unknown keys rejected (e2e pinned).
- `failOnError` default flipped to true; the deliberately-invalid eslint demo
  `router/examples/eslint-rule-test.routes.ts` is excluded from the router tsconfig program
  (it trips MKR007 by design).
- **Upstream fix required and shipped** (ts-run-types, same branch as the report feature):
  the anonymous-lane extractor hardcoded marker positions to slots 0/1 and only
  pre-filtered the FIRST argument for an inline fn, so a leading-param wrapper
  (`serverMapFrom(source, mapper, hash?)`) never extracted. Generalized to
  position-DISCOVERED marker pairs + any-arg pre-filter + `undefined` padding for optional
  gaps; overloaded wrappers resolve per call site (the marker-free string overload never
  extracts). Go tests: leading-param wrapper, overload no-extract, padding; report fixture
  extended with the mion shape (`mapAcmeFrom`).
- eslint `no-vite-client` updated (name is the 2ND arg; inline mapper errors in non-Vite);
  `pure-functions` rule already matched the restored API. The `examples/` mapFrom sources
  were already written in the inline form — correct again as-is.

## Motivation

The client-orchestration story (mion as a GraphQL alternative) needs
`serverMapFrom(subRequest, mapper)` with the mapper declared **inline in client
flow code** while it **executes on the server**. The deepkit-era plugin delivered
this through the shared AOT cache (mapper body extracted at build time, loaded by
both bundles; wire carried only `bodyHash`). The ts-runtypes migration replaced it
with a name-based stopgap — `serverMapFrom(source, 'fnName')` +
`registerMionPureFn('fnName', factory)` hand-written on the server
([client/src/routesFlow.ts](../../packages/client/src/routesFlow.ts):71,
[test-server.ts](../../packages/test-server/src/test-server.ts):20) — which works
but drops the inline ergonomics. The `examples/` sources and both eslint rules
(`pure-functions`, `no-vite-client`) still encode the ORIGINAL inline signature
`serverMapFrom(source, mapper, name?)`, so docs/lint currently drift from the
runtime.

Security framing (why this is safe where wire-shipping is not): the mapper moves
between bundles at **build time**; the wire still carries only the content hash.
The server executes only functions its own build baked in — an unknown hash from a
client is rejected, never evaluated.

## Design (agreed 2026-07-19)

ts-runtypes 0.10.0's anonymous lane does the extraction: `serverMapFrom` carries
`PureFunction<F>` + trailing `InjectPureFnHash<F>` markers, so the plugin rewrites
the mapper arg to the generated `__rt_pf…` binding and injects `'rt::<hash>'`.
mion's vite plugin adds the transport:

1. **Harvest (client build)** — consume the upstream `onPureFnReport` callback /
   `pureFnManifest` JSON (the ts-runtypes todo above), filtered to
   `calleeModule === '@mionjs/client' && calleeName === 'serverMapFrom'`. No
   parsing of rewritten source.
2. **Manifest** — write `.mion/server-mappers.json`: one `{key, code, paramNames,
   pureFnDependencies}` per mapper.
3. **Inject (server build)** — mion plugin exposes `virtual:mion/server-mappers`
   (reads the manifest, registers each entry into the ts-runtypes runtime cache
   via `addPureFn`, `createPureFn` lazily materialized from `code` — same lane
   `addSerializedJitCaches` already uses) and side-effect-imports it into the
   server entry.
4. **Runtime** — `serverMapFrom(source, mapper)` returns a ref with
   `bodyHash = 'rt::<hash>'`; router dispatch
   ([router/src/routesFlow.ts](../../packages/router/src/routesFlow.ts):244,300)
   switches `hasMionPureFn/getMionPureFn(name)` →
   `hasPureFnByKey/getPureFnByKey(bodyHash)` (untracked runtime-key lookups, no
   CTA003). Client-side the mapper body is dead weight — trimming it is a
   MION-side optimization (post-process/tree-shake the client bundle; explicitly
   out of ts-runtypes scope), fine to defer.

Keep the name-based form as the explicit fallback for non-Vite clients
(`serverMapFrom(source, name)` string overload — matches the `no-vite-client`
eslint rule's intent).

## Build ordering

- **Production**: sequential `build client → manifest → build server` — mion
  drives it; deterministic.
- **Dev/vitest** (managed server spawns at client `buildStart`): pre-populate the
  manifest with a standalone resolver scan of the client source at server startup,
  or gate `serverReady` on the manifest file; HMR pushes new mappers to the
  running server.

## Also fix while here

- `examples/` mapFrom sources + `pure-functions` / `no-vite-client` eslint rules:
  re-align with the final signature `serverMapFrom(source, mapper)` +
  `serverMapFrom(source, name)` fallback (they currently describe the
  pre-migration 3-arg shape).
- Revisit `mionVitePlugin`'s `failOnError` default (currently false because the
  adapter's runtime-key lookups tripped CTA003; the `getPureFnByKey` switch plus
  scanner-clean registration should allow flipping it to true).

## Acceptance criteria

- Client spec: `serverMapFrom(customer, (c) => c.preferenceId)` inline — no
  server-side `registerMionPureFn` — routesFlow e2e green (mapper runs
  server-side, wire carries `rt::<hash>` only).
- Unknown/forged hash from a client → routesFlow-mapping-missing-pure-fn error
  (never evaluation).
- Name-based fallback still green; eslint rules + examples match the shipped API.
