# JS packages

One pnpm workspace, one `@mionjs/*` namespace, one release train. Read before a dependency or package change.

## Dependencies

- Type-system + framework packages ride the same `version.json` lockstep, depend on each other via `workspace:*`.
- All `dependencies` / `devDependencies` exact-pinned. THREE peerDeps stay ranges:
  - `@mionjs/devtools`: so consumers can dedupe Vite.
  - `@mionjs/drizzle-orm-*-core` → `drizzle-orm` peer: the range IS the compatibility promise of their
    drizzle-aligned version line.
  - `@mionjs/drizzle-orm-*-core` → `@mionjs/run-types` peer: consumer's single copy supplies BOTH the format types
    and the runtime `getRunType` the tableFromType/toDrizzle marker overloads forward to.
    Exact pin would also force a republish every release.
- Cross-package deps: `workspace:*`. Every `@mionjs/*` dep on `RunTypes/*` too → mion tests need the Go toolchain.
- devDependencies live root-level, never per package. TWO exceptions (dev deps never reach a consumer):
  - each drizzle dialect package carries `@mionjs/run-types: workspace:*` (satisfies its own peer in the workspace);
  - `@mionjs/run-types` carries `@mionjs/devtools` + `@mionjs/bin-compiler` (the `mion` CLI its build runs).
- ⚠️ One way only: `@mionjs/devtools` NEVER depends on or imports `@mionjs/run-types` (else workspace cycle).
  Why + how its tests cope: [devtools/AGENTS.md](devtools/AGENTS.md). `pnpm run check:tree` fails on any cycle.

## Published READMEs stay thin

- Short description, sibling relationship, link to [mion.pages.dev/runtypes](https://mion.pages.dev/runtypes),
  status/license lines. Nothing else.
- No option tables, no usage walkthroughs, no env vars or dev-only knobs: the website is their one home.
- Applies to the three package READMEs + the generated per-platform `@mionjs/native-compiler-*` one.
  Pinned by `repo-contracts.test.ts`. Root [README.md](../README.md) exempt.

## Type system

- [run-types](run-types/) (`@mionjs/run-types`): public marker + runtime helpers (`InjectRunTypeId<T>`,
  `InjectTypeFnArgs<T,Fn>`, `getRunTypeId`, runtime family bodies).
- [devtools](devtools/) (`@mionjs/devtools`): build-tool integration around the resolver, the ONLY devtools package.
  Read [its AGENTS.md](devtools/AGENTS.md) first.
  - Transform: rewrites `createX<T>()` call sites, injects the import block.
  - Codegen: per-entry cache modules under `<genDir>/types/`.
  - Enrich: scaffolds + keeps in sync the FriendlyText + MockData mirror files.
  - Lint: ONE `mion` plugin on the `./eslint` (and `./oxlint`) subpath, four rules, one per level
    (`mion/error`, `mion/runtime-error`, `mion/warning`, `mion/info`), never one per topic.
    Every check lives in the compiler: [src/lint/AGENTS.md](devtools/src/lint/AGENTS.md).
  - Presets: `@mionjs/devtools/vite` (`mionVitePlugin`) + `@mionjs/devtools/next` (`withMion`) = mion-opinionated.
    Plain adapters: `@mionjs/devtools/runtypes/*` (vite, rollup, rolldown, webpack, rspack, esbuild, bun, next).
    Both presets map options through `src/options.ts` so they cannot drift.
  - ⚠️ Next.js / Turbopack ([src/runtypes/next/](devtools/src/runtypes/next/)): bundler with NO plugin API →
    broker started from `next.config` + a `turbopack.rules` loader. `withMion` composes those pieces,
    never nests one wrapper in another. Read [its AGENTS.md](devtools/src/runtypes/next/AGENTS.md) first:
    invariants there look like cleanups but are not.
- [bin-compiler](bin-compiler/) (`@mionjs/bin-compiler`): platform launcher + the `mion` CLI command.
  - `getExePath()` resolves the prebuilt resolver binary from per-platform
    `@mionjs/native-compiler-<os>-<arch>` optional deps.
  - NEVER add a postinstall downloader: `ignoreScripts: true` blocks it.
  - `constants.Version` is folded into typeID hashes. `constants.TsgoVersion` = metadata, NEVER enters the hash.
- [examples](private-examples/) (`@mionjs/examples`): MERGED compilable TS examples (mion + runtypes) for both docs
  sites' `<code-import>` blocks. Root `typecheck` compiles them → doc drift fails CI.

## Framework

- [core](core/): shared foundation (`RpcError`/`TypedError`, router metadata, response framing,
  mion↔mion reflection adapter under `src/runtypes/`).
- [router](rpc-router/) (`@mionjs/router`): HTTP routing + request handling. [client](rpc-client/)
  (`@mionjs/client`): client-side utilities.
- [drizzle-orm](drizzle-orm/) (`@mionjs/drizzle-orm`): dialect-agnostic slim recorder core
  (column/table/entry/sql recorders, flat Infer\* models, refineTableType). Never imports drizzle.
- [drizzle-orm-pg-core](drizzle-orm-pg-core/) / [-mysql-core](drizzle-orm-mysql-core/) /
  [-sqlite-core](drizzle-orm-sqlite-core/): per-dialect authoring surfaces, drizzle-identical builders/helpers that
  RECORD calls. `toDrizzle` on the `./drizzle` subpath = the one drizzle-importing module (`drizzle-orm` optional peer).
  - All four ride the drizzle version line, not the lockstep train (`versionLine` package.json marker).
    Republish only when their own published sources changed ([drizzle-line.mjs](../scripts/lib/drizzle-line.mjs)).
  - Generator config: [drizzle-dialects.json](../drizzle-dialects.json). Same run emits the import map
    `mion drizzle-migrate` rewrites with.
  - Proven against real databases by the drizzle-e2e lane ([container/AGENTS.md](../container/AGENTS.md)).
- `platform-aws|bun|cloudflare|gcloud|node|uws|vercel`: platform adapters.
  [test-server](private-test-server/): private e2e fixture server.
- [bin-uws](bin-uws/) (`@mionjs/bin-uws`): loader for the uWebSockets.js prebuilt binaries platform-uws runs on
  (sha256-verified on-demand fetch in dev via `pnpm miondevx core build uws`).
