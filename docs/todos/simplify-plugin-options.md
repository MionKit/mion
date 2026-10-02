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

A client that is NOT built with its API keeps one supported road: `bundleApi: false` plus the fetchMetadata
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
  `bundleApi: false` + fetchMetadata.

Keep:

- `server` (vite only): hosts the API inside `vite dev` and outputs the second bundle.
- `bundleApi` (default true) at the top level, now that no `api` block exists to fold it into.
- The batch-by-id design as it is; only its source narrows to the build's own program.

Check after removal that the remaining option names read clearly in both presets
(`MionPresetOptions`, `MionPluginOptions`, `MionNextOptions`), and rename only if something still reads badly.

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

- `client`, `api`, `clientTsconfig`, `apiTsconfig` and the two CLI flags are gone from code, tests, docs,
  examples and the e2e consumer; a grep finds them only in `docs/done/` and `CHANGELOG.md`.
- The batch page explains why only precompiled batches run.
- A client built apart from its API is covered by a test using `bundleApi: false` + fetchMetadata.
- `pnpm test` and `go -C ts-go-runtypes test ./internal/... ./cmd/...` pass.
- The PR carries the `pre-publish-e2e` label (public options removed) and `website`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
