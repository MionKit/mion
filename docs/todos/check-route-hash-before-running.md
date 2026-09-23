---
type: feature
spec: guidelines
status: ready
created: 2026-09-23
---

# Check each route's metadata hash before the call runs

## The problem

A client encodes a call with the route's metadata row (params hash, strategies, chain): bundled at build time,
fetched, or restored from the metadata store. When the server behind the same address changed (a redeploy, another
server on the same port), that row can be outdated. The API id check (`x-build-version`, `apiVersionCheck`, the
client's version recovery) catches a whole-API change, but only after a response, and only for bundled routes.

When a route's params or return type changed on the server, the frontend code was written against the old types:
nothing can make the call right, not a retry and not fresh metadata. The call must fail before any handler runs,
with a clear error the app sees. Anything else that changed in the route's metadata (options, parser strategy,
middleware chain) must NOT stop the call: the router tries to run it, and its own validation and serialization
report what does not fit.

## What to build (decided with the user)

1. **Keep the API id feature exactly as it is**, server and client: `InjectBuildVersion` at `initRoutes` /
   `initClient`, `x-build-version`, `apiVersionCheck`, `MET007`, the client's version recovery.
2. **Keep optimistic first calls.** Known limit: a call sent without a row cannot be checked; document it.
3. **A new middleware `mion@checkRouteHash`** (name open), registered right after `mionDeserializeRequest`, skipped
   without running its params pipeline when its body slot is absent (the on-demand caller pattern of
   `mion@methodsMetadata`, `packages/router/src/routes/client.routes.ts`).
   - It compares ONLY what cannot be recovered from: the route's params and return type hashes
     (`paramsJitHash`, `returnJitHash`, which are content ids of the types). One comparison line.
   - On a mismatch it RETURNS (never throws) a `FatalError<'route-types-mismatch', ...>` in its own typed slot,
     so the client reads it strongly typed like any mion error, and a returned `FatalError` ends the chain
     (`packages/router/src/dispatch.ts`). The client does not retry: it reports the error to the app.
   - Any other difference: the middleware lets the call run.
4. **One definition of what a row means to the client, and tests that both ends agree** (see below).

## Open questions for the implementer / user

- When does a call send the hashes? Every call, or only when the API id says the server changed?
- A row restored from the metadata store while the frontend itself is current (both ends redeployed, the saved
  copy is old): here fetching the row again WOULD fix it. Refetch once before reporting the error, or treat it
  like any other mismatch?
- A batch: one pair of hashes per route, or one combined value?
- Which error slot the app sees it in (undeclared, like the version recovery's report today?).

## The row fields that decide how a call is read (for the parity tests)

The client reads these, and only these, from a row (checked against `packages/client/src`):

| Field | What the client uses it for |
| --- | --- |
| `type` | recognising headers middleware |
| `paramsJitHash`, `returnJitHash` | which compiled functions encode, decode and validate |
| `paramsCount`, `hasReturnData` | encoding and decoding |
| `headersParam`, `headersReturn` (names + hash) | header extraction and checks |
| `middlewareIds` | restoring prefilled middleware, validating them |
| options `parser` | which compiled functions (normalise: a single name equals the `{params, return}` pair) |
| options `isMutation` | GET or POST |

Left out on purpose: `isAsync` (the dispatcher flips it at runtime), `maxBodySize` (platform dependent),
`validateParams`, `validateReturn`, `alwaysRun`, `description`, `paramNames`, `pointer`, `nestLevel`.
`sanitizeParams` is read by the client's local cleanup today (`packages/client/src/lib/sanitize.ts`); decide
whether it joins the list or the client stops reading it.

Only `paramsJitHash` and `returnJitHash` gate a call. The full list is what the parity tests below compare, so
both ends are proven to agree on everything a client acts on. Keep the list in one place in `@mionjs/core`
(normalise: `undefined` and `null` alike, empty `middlewareIds` as absent, a missing `paramsCount` as 0).

## Parity tests: client and server compile the same metadata

Add them to the bundled and mixed client lanes (`packages/client/test/bundled`, `test/mixed`):

- **Every method of the test server, not a hand-picked few.** A dispatch point that names every id at once gets the
  whole API injected: an object method named `call` (the build only looks at `call`, `prefill`, `typeErrors`,
  `initClient`) taking `InjectApiMetadata<TestServerApi, MethodIds<TestServerApi>>`, where `MethodIds` is a mapped
  type joining nested keys with `/`.
- For each method: the bundled row and the server's row read alike field by field (the list above).
- For every compiled function a row reaches (the `isType`, `typeErrors`, `encode`, `decode` hashes for its
  parser, then `rtDependencies` recursively): the client entry (`getRTUtils().getRT(hash)`) equals the server's
  `deps[hash]` on `fnID`, `args`, `defaultParamValues`, `isNoop`, `rtDependencies`, `pureFnDependencies` and code.
  Compare the code as a syntax tree (vite's `parseAst`, positions and `EmptyStatement` dropped), not as text: the
  test runner's module transform adds an empty `;` to the bundled factory. Read a bundled entry's code with
  `entryCode`. Header check functions are never sent by the server, so leave them out.
- The existing partial parity test in `test/bundled/bundled.spec.ts` becomes redundant once this lands.

## End-to-end: one client, servers that moved on, one port

A new client lane (`client-drift`, mixed bundleApi) with a client typed and built against API A, and servers A, B
and C started in turn on ONE port, the metadata store kept across page reloads:
- B = A plus a route the client's types lack, and a route whose params changed; C changes them again, and keeps
  one route identical to B's so its stored row must NOT be rewritten.
- Phases: A, then B, then C, then A again; every phase repeats the checks: an untyped route works, a route whose
  params changed fails with the mismatch error and runs no handler, a route whose options changed still runs,
  rows stored from the previous server.
- Gotchas found building it: each server runs in its own forked process with its own tsconfig (the router is one
  per process); fork with `execArgv: []` (a test worker runs under `--conditions source`, which makes node load raw
  TypeScript); call `server.closeAllConnections()` before `close()` so the port frees; keep the drift API files out
  of the shared client test program (`packages/client/tsconfig.json`), or the build reports two API ids (MET007),
  and give them their own `typecheck:test` entries; add the lane to `scripts/core/test-batches.mjs`, the root
  `vitest.config.ts`, and `LIGHT_PROJECTS` in `packages/devtools/test/test-batch-contracts.test.ts`.

## Docs

`container/website/content/01.rpc/03.client/02.metadata-cache.md` and `03.client/05.bundled-api.md`: what happens
when the server changes; `03.client/00.client-overview.md`: the optimistic first call's limit.

## Out of scope

- Changing or removing the API id feature.
- Removing optimistic first calls.

## Done when

- A call whose params or return types changed on the server never runs a handler, and the app gets a clear error.
- Any other metadata difference lets the call run.
- The row field list lives in one place.
- Parity tests cover every test-server method, rows and compiled code.
- The drift lane passes all four phases.
