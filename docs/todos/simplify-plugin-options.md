---
type: chore
spec: guidelines
status: ready
created: 2026-10-01
---

# Simplify the mion plugin options: fullstack builds only

## Intent

mion supports two ways to build a client against its API:

- **Fullstack**: client and API are compiled by ONE build process, over one TypeScript program. One config
  can still output two bundles (`server.build`), so client and server deploy separately.
- **Separate projects**: the client build compiles the API's route types again from the API project
  (`api.tsConfig`), and the API build reads the client's batches from the client project (`client.tsConfig`).

The separate-projects model is dropped. It came from the time Next.js could not be transformed, so the API
was built by vite in its own process. That is no longer needed (`withMion` transforms Next.js). It is also
unreliable: compiled run types depend on the whole project (installed packages, `lib`, which types are
native and so not `DataOnly`), not only on a tsconfig, so a client recompiling the server's types can drift
from what the server runs. There are no users yet, so nothing needs a migration.

A client that is NOT built with its API keeps one supported road: `client: {routes: 'fetch'}` plus the fetchMetadata
middlewares. The server ships its own compiled functions at runtime, so they always match the server; the
client's route types only drive editor hints.

Batches become fullstack only. There is no id-less batch mode: only batches compiled into the server's
build can run.

## Direction

Remove, leaving no trace (no alias, no "removed" warning, no old-name test or doc line):

- The preset options `client` (`MionClientPointer`) and `api` (`MionApiPointer`) in
  `packages/devtools/src/options.ts`, `MionClientBundleOptions`, and their uses in
  `packages/devtools/src/vite/mionVitePlugin.ts`, `packages/devtools/src/vite/index.ts` and
  `packages/devtools/src/next/index.ts`.
- The resolver options `clientTsconfig` / `apiTsconfig`: the tsconfig plugin keys
  (`packages/devtools/src/core/plugin-option-keys.ts`, the generated `tsconfig-plugin-keys.generated.ts`),
  the protocol fields (`packages/devtools/src/core/protocol.ts`, `ts-go-runtypes/internal/protocol/`), the
  unplugin and resolver-client plumbing, and the CLI flags `--client-tsconfig` / `--api-tsconfig`
  (`ts-go-runtypes/cmd/mion/`).
- The Go machinery that only exists for them: the peer program (`internal/compiler/resolver/peer.go`), the
  `apiTsconfig` branches in `apigen.go` / `apiversion.go` / `apimeta`, the client-project branch of the
  batch table in `rpcgen.go`, and the diagnostics that only those raise (`CodeApiMetaSourceAmbiguous`,
  `CodeBatchOwnBatchIgnored`), with their prose, catalog rows and tests.
- The dev-server watch of a separate client project (`packages/devtools/test/client-tsconfig-refresh.test.ts`
  and the code it covers).
- The pre-publish e2e consumer's separate `client-app` setup (`container/pre-publish-e2e/mion-consumer/`,
  `scripts/release/e2e.mjs`): rewrite it as a fullstack consumer, keep a lane for a client using
  `client: {routes: 'fetch'}` + fetchMetadata.

## The new shape

Agreed shape for `mionVitePlugin`:

```ts
mionVitePlugin({
  tsConfig: 'tsconfig.json',          // default, can be left out
  client: {
    routes: 'fetch',                  // 'bundle' (default) | 'fetch'
  },
  server: {
    entry: 'src/server.ts',
    build: {outDir: 'dist-server'},
    exclude: [/^\/docs/],
    hotReload: false,
  },
  runTypes: {emitMode: 'both'},       // settings for the whole build
})
```

The smallest fullstack config is `mionVitePlugin({server: {entry: 'src/server.ts'}})`.

Each block says which side it affects:

- `tsConfig` (top level, moved out of `runTypes`): the ONE tsconfig whose program holds client and server
  code. Defaults to `tsconfig.json` at the vite root (Next: its cwd). A tsconfig whose program has no files
  (a solution-style one with only `references`, as the Vite starters ship) fails with a clear error asking
  for the tsconfig that covers both.
- `client`: settings about how the client talks to the API. Today only `routes`, replacing `bundleApi`:
  `'bundle'` (default) puts the compiled route functions in the client bundle, `'fetch'` gets them from the
  server at startup through the fetchMetadata middlewares. No `client.entry`: the client is vite's (or
  Next's) normal build and its entry already lives in their own config.
- `server` (vite only, optional): the API this vite run hosts. `entry` (renamed from `startScript`) is
  loaded inside `vite dev` to mount the API, and is the input of the server bundle when `build` is set.
  `exclude` (only when the router has no `basePath`) and `hotReload` stay. Leave `server` out when the API
  is started another way (a library-mode server build over the same tsconfig, say).
- `runTypes`: settings for the whole build (`emitMode`, `genDir`, `downgradeErrors`, ...), minus `tsConfig`.

Removed from `server`, as duplicates:

- `basePath`: the dev mount prefix. It already falls back to the router's own `basePath`, which becomes
  the only one.
- `platform`: the plugin finds the platform adapter from the entry's own imports. Platform adapters must
  then learn they run inside `vite dev` (and must not open a port) without being told before the entry
  loads, for example through a flag `@mionjs/core` exposes that the plugin sets first.

Next.js (`withMion`) takes the same `tsConfig`, `client` and `runTypes` (plus its own `cwd`), and has no
`server` block: the API is a Next route file, served and bundled by Next. Both presets read the shared
part through one type and one mapper (`MionPresetOptions` / `toRunTypesOptions` in
`packages/devtools/src/options.ts`), so they cannot drift.

The tsconfig plugin key and the CLI flag behind `bundleApi` follow the rename and take the same two words
(`clientRoutes: 'bundle' | 'fetch'`, `--client-routes`), so a setting reads the same in every place.

Unchanged: the batch-by-id design; only its source narrows to the build's own program.

## Docs

- RPC → Client → Batch (`04.client/03.batch.md`), the "batches are compiled at build time" section: say
  that only batches compiled into the server's build can run, and why. Compiling them ahead of time is safer
  (a caller cannot make the server run a route combination you never wrote), and the server builds each
  batch's execution chain once instead of working it out for every new batch a client sends. Say that
  batches need the client and the API in one build.
- RPC → Devtools → Vite: "All Plugin Options" block and the sections naming the removed options (Server-Only
  Builds, Fullstack Apps, One Config, Two Bundles, Bundled Client, Client Without the Plugin, Batch
  Transport). The separate-client-project text goes.
- RPC → Devtools → Next.js and CLI pages.
- RPC → Middlewares → fetchMetadata and fetchMetadata client pages: this is now THE road for a client built
  apart from its API; say so where the page explains when to use it.
- RunTypes → Introduction → Configuration: drop the `clientTsconfig` / `apiTsconfig` keys.
- Example configs under `packages/private-examples/src/codegen/` (vite-*.config.ts).
- `packages/private-test-server/README.md` and `packages/run-types/test/fuzz/README.md` if they name the
  removed options.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and
example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The old names (`api`, `bundleApi`, `startScript`, `server.basePath`, `server.platform`,
  `runTypes.tsConfig`, `clientTsconfig`, `apiTsconfig` and their CLI flags) are gone from code, tests, docs,
  examples and the e2e consumer; a grep finds them only in `docs/done/` and `CHANGELOG.md`.
- The batch page explains why only precompiled batches run.
- Both presets take the new shape, with tests for each block, `server.entry` dev mounting with no
  `platform` / `basePath` option, and the empty-program tsconfig error.
- A client built apart from its API is covered by a test using `client: {routes: 'fetch'}` + fetchMetadata.
- `pnpm test` and `go -C ts-go-runtypes test ./internal/... ./cmd/...` pass.
- The PR carries the `pre-publish-e2e` label (public options removed) and `website`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan — fullstack option shape (approved 2026-10-02)

### Commits (one branch, `claude/nifty-bell-di0ajv`)

#### 1. Go: remove the peer program, rename bundleApi
- `cmd/mion/config.go` / `main.go`: drop `clientTsconfig` / `apiTsconfig` keys and `--client-tsconfig` /
  `--api-tsconfig` flags. Rename key `bundleApi` (bool) to `clientRoutes: "bundle" | "fetch"` and flag
  `--bundle-api bundled|off` to `--client-routes bundle|fetch`. `internal/constants`: `BundleApiMode` becomes
  `ClientRoutesMode` (`bundle` / `fetch`). `resolver.Options.BundleApi` becomes `ClientRoutes`.
- Delete `resolver/peer.go` (+ `isDeclarationFileName` in `rpcgen.go`).
- `rpcgen.go`: `batchSourceSession` collapses to `sess`; delete `checkClientResolution`, `clientPackages`,
  `closeBatchSource`, `batchSourceWatchSet`, the `separate` branch and `rpcCollection.sourceDiags/files/roots`.
- `apigen.go`: `clientApiTree` keeps only the same-program walk; drop the `ApiTsconfig` branch of
  `resolveApiBundle`, `apiSourceTree`, `apiFetchMemo.peer/peerTrees`, `peerMatch`; `clientManifest` loses
  `ApiTsconfig`. `apimeta.Manifest.ApiTsconfig` field goes.
- `apiversion.go`: `apiVersionTrusted` becomes `importsRouter()` (a fullstack program always imports it).
- `protocol.go` + `dispatch.go`: drop `BatchSourceFiles` / `BatchSourceRoots`.
- Diagnostics: retire MET005 and BAT008 (delete const, registration, headline, prose; one "retired" line in
  the code file, the repo's existing pattern, e.g. `codes_runtype.go` RUK003). Reword MET001/002/003/010/011
  prose that names `api.tsConfig` / `bundleApi` to the new names. Regenerate: `pnpm miondevx core codegen all`.
- New check: a tsconfig whose program has zero root files (solution-style: `files: []` + `references`) fails
  with a clear error naming the file and asking for the tsconfig that covers client and server
  (`program.New` path, `internal/compiler/program/program.go`).
- Tests: delete peer-only tests (`rpcgen_test.go` ClientTsconfig*/OwnBatchesWarn*, `apigen_test.go`
  ApiTsconfig*, `batchcompile` ClientTsconfig* tests); rewrite `TestApiGen_ManifestsAgreeAcrossProjects` and
  `TestApiVersion_ServerAndClientOfOneApiAgree` as one-program tests; `setupApi` drops the tsconfig param;
  `TestResolveBundleApi` becomes `TestResolveClientRoutes`; add a test for the empty-program error.

#### 2. devtools + platform adapters: the new option shape
- `src/options.ts`: `MionPresetOptions = {tsConfig?, client?: {routes?: 'bundle'|'fetch'}, runTypes?}`;
  delete `MionClientPointer`, `MionApiPointer`, `MionClientBundleOptions`; `MionRunTypesOptions` loses
  `tsConfig`. `toRunTypesOptions(options)` maps `tsConfig` → `tsconfig`, `client.routes` → `clientRoutes`,
  rejects a bad `routes` value.
- `src/core/unplugin.ts`, `resolver-client.ts`, `plugin-option-keys.ts`, `protocol.ts`, `lint/session-protocol.ts`:
  `bundleApi` → `clientRoutes`; drop `clientTsconfig` / `apiTsconfig`; delete the batch-source watcher
  (`batchSourceFiles/Roots`, `watchBatchRoots`, `onBatchSourceChange`, the `configureServer` watch, the
  `handleHotUpdate` skip). Plain adapters (`@mionjs/devtools/runtypes/*`) inherit the same `PluginOptions`.
- `src/vite/mionVitePlugin.ts`: `server.startScript` → `server.entry`; remove `server.basePath`,
  `server.platform`. `src/vite/index.ts` drops the pointer exports. `src/next/index.ts`: same shared shape;
  the `server` guard error loses its `client.tsConfig` clause.
- Removing `server.platform` (middleware mode, `src/vite/middlewareMode.ts`):
  - `@mionjs/core`: a host flag on `getOrCreateGlobal` (`packages/core/src/utils.ts:10`), e.g.
    `setHostOwnsSocket()` / `hostOwnsSocket()`. The plugin sets it before `ssrLoadModule(entry)`, no adapter
    import needed.
  - platform-node `startNodeServer` / platform-bun `startBunServer` skip `listen` when the flag is set (same
    path as `asMiddleware` today) and register their handler on the same core slot; uws throws on it.
  - `pickHandler`: entry exports first, then the registered handler; else the existing "export a handler"
    error. Mount path = router `basePath` only. `assertNotListening` stays.
- Rebuild `@mionjs/devtools` dist after src edits.
- Tests: `mion-presets.test.ts` (new shape, bad `routes` value, no old keys), `middlewareMode.spec.ts`
  (no `platform` option, node + bun-style entries, entry with no export picks the registered handler),
  `batchesModule.spec.ts`, `dev-reporter.test.ts` (drop the client-project case),
  `bundledApiBuild.spec.ts`, `viteEnvironments.spec.ts`; delete `client-tsconfig-refresh.test.ts`;
  `cli-surface` snapshot `-u`; `plugin-option-parity.test.ts` must pass after codegen. Core / node / bun
  unit tests for the host flag.

#### 3. Every config in the repo
- ~30 vite/vitest configs: `runTypes: {tsConfig}` → `tsConfig`; `bundleApi` → `client.routes`
  (`packages/rpc-client/vitest*.config.ts`, `private-drizzle-example-app`, `private-test-server`, platform
  packages, `container/mion-bench`, `container/pre-publish-e2e/apps/mion-next/next.config.mjs`).
- `MION_E2E_BUNDLE_API` → `MION_E2E_CLIENT_ROUTES` (`scripts/lib/env.mjs` registry + every reader).
- Comment / error-string mentions of `bundleApi` in rpc-client, rpc-router, run-types `markers.ts`,
  platform-node/bun `types.ts`.

#### 4. Pre-publish e2e consumer (`container/pre-publish-e2e/mion-consumer/`, `scripts/release/e2e.mjs`)
- Move `client-app/src/{batchFlow,decoys}.ts` into the main program (`src/client/`), delete
  `client-app/tsconfig.json`, drop `--client-tsconfig` and the second compile.
- `compile-output.spec.ts`: new paths, batch count "at least", drop the decoy-isolation case.
- Add a `--client-routes fetch` client lane: client calls `useFetchMetadata`, server mounts
  `mionFetchMetadata`, batch round-trips under plain node.

#### 5. apiids fuzz suite, reworked for one program (`packages/run-types/test/fuzz/apiids/`)
Your point holds: one program can still be built twice (client and server), and both builds must agree.
- One temp project, one tsconfig, holding the routes, the probes and a client calling them.
- A1 unchanged (manifest rows = marker probe ids).
- A2: two independent `mion compile` runs (server gen dir, client gen dir with `--client-routes bundle`)
  give byte-identical `api/` output, and the bundled method modules carry exactly the manifest's ids.
- A3: `mion api-check` over the two gen dirs exits 0.
- Drop the different-tsconfig premise and its negative control; rewrite the `apiids/` section of
  `test/fuzz/README.md`.

#### 6. Docs (website + examples)
- `04.client/03.batch.md`: in "How Batched Requests Are Compiled", say only batches compiled into the
  server's build run, and why (safer: callers cannot make up route combinations; the run order is built
  once per batch, not for every new batch). Delete "Using a Separate Client Project" and the link at :10.
- `07.devtools/02.vite.md`: Server-Only Builds, Fullstack Apps, One Config Two Bundles, Bundled Client,
  Client Without the Plugin, Batch Transport, All Plugin Options block → new shape; the `basePath` prose
  points at the router option only.
- `07.devtools/03.nextjs.md` (Sharing Batches With Your API, Options), `07.devtools/04.cli.md` (drop
  "Client Project in tsconfig" and the API-pointer parts of "Compiling a Bundled Client" / "Checking a
  Client Against Its Server"; flags → `--client-routes`).
- `03.middlewares/01.fetch-metadata.md` and `02.fetch-metadata-client.md`: `client: {routes: 'fetch'}`, and
  say this is the way for a client built apart from its API; drop the MET005 row.
- `02.runtypes/01.introduction/04.configuration.md`: keys table.
- `06.platforms/06.vercel.md` (+ cloudflare / error-levels pages if they set `runTypes.tsConfig`).
- Examples `packages/private-examples/src/codegen/`: update `vite-client`, `vite-middleware`,
  `vite-fetched-client`, `vite-server`; delete `vite-bundled-client.config.ts` and `next-bundled-config.ts`
  and their `<code-import>`s. `packages/private-examples/vite.config.ts`, `src/cloudflare/*.vite.config.ts`.
- `packages/private-test-server/README.md` (already stale pointer text).

#### 7. Finish (skill steps 8-10)
- Append the approved plan to the todo, reconcile with what shipped, `git mv` to `docs/done/`.
- `docs-simplifier` and `comments-simplifier` subagents in parallel, each result committed on its own
  (`docs(simplify): …`, `chore(comments): …`).
- Open the PR only when asked; labels `pre-publish-e2e`, `website`.

### Fuzzing
The apiids suite already exists; it is reworked (section 5), no new fuzz suite.

### Verification
- `pnpm miondevx core build` (Go binary + dists), then `go -C ts-go-runtypes test ./internal/... ./cmd/...`.
- `pnpm miondevx core codegen all --check`.
- `pnpm test` (or `pnpm run test:ci` on OOM); `pnpm miondevx core fuzz apiids`.
- `pnpm run lint`, `pnpm run format`, `pnpm run typecheck`, `pnpm exec vitest run website-links`.
- Grep: no `bundleApi`, `apiTsconfig`, `clientTsconfig`, `startScript`, `--bundle-api`, `--api-tsconfig`,
  `--client-tsconfig`, `MionClientPointer`, `MionApiPointer` outside `docs/done/` and `CHANGELOG.md`.
- Pre-publish e2e (`pnpm miondevx release e2e`) runs in CI via the `pre-publish-e2e` label.

### Done when (from the todo)
Old names gone everywhere; batch page explains precompiled batches; both presets take the new shape with
tests; a fetch-mode client is covered; Go and JS suites pass; PR labelled `pre-publish-e2e` + `website`;
both simplification passes committed on their own.
