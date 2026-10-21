# @mionjs/devtools guidelines

## ⚠️ This package is consumed COMPILED

- Exports point to `./dist/`, not source. Exception: the two mion preset entries also declare `source` (in-repo tests).
- Root eslint loads `./eslint` through node (never sees `source`) → other packages + root lint run compiled JS.
- `dist/` = gitignored build artifact. `pnpm run check:builds` rebuilds it when stale.
- After editing `src/`, rebuild BEFORE other packages' tests or root lint: `pnpm --filter @mionjs/devtools run build`.
- `devtools-core` suite imports source by relative path: no rebuild needed.

## ⚠️ devtools never depends on run-types

- One way only: `@mionjs/run-types` lists `@mionjs/devtools` as dev dep (its tests run through the vite plugin).
- devtools lists nothing from run-types, in any `package.json` field (else cycle: pnpm warns, guesses build order).
- **Nothing in `src/`, `test/` or vitest configs imports `@mionjs/run-types`**, not even a type.
- Test of run-types behaviour (validator accepts/rejects, mock matches pattern) → `packages/run-types/test`,
  plain TypeScript like the rest of that suite.
- **Fixture sources may name it.** Devtools tests feed the compiler a small project as text, check output
  (rewrites, diagnostics, generated modules).
- Compiler only matches markers declared in a package named `@mionjs/run-types` → each fixture gets the REAL
  built package: `MARKER_PACKAGE_OVERLAY` / `writeMarkerPackage` / `createMarkerProject` in
  `test/helpers/inline.ts` copy `packages/run-types/dist` by path. Never a hand-written copy (drifts).
- **Bundler-built fixture** installs the package as types only → mark `@mionjs/run-types` external
  (rollup, vite, esbuild) or alias it to a small stub file (vite dev server).
- Build fixtures live in their own temp dir, never inside another package.
- Two CI guards: `pnpm run check:tree` (no workspace dependency cycle, `scripts/ci/check-tree.mjs`) +
  the "devtools code never imports @mionjs/run-types" case in `test/repo-contracts.test.ts`.

### Build order

- Builds are independent: run-types builds with the `mion` CLI from `@mionjs/bin-compiler`, devtools with `tsc`.
- TESTS need BOTH dists built first: run-types tests load the vite plugin from `packages/devtools/dist`,
  devtools tests copy `packages/run-types/dist` into fixtures.
- `pnpm run check:builds` builds both when stale; every `pretest` hook runs it. Missing run-types dist → devtools
  suite fails with a message saying so.

## Scope

Both former devtools packages in one: the whole build-time surface.

- `src/core/`: resolver client, transform, edit buffer, codegen. Bundler agnostic.
- `src/runtypes/`: unopinionated adapter entries, one per bundler, plus `next/`.
- `src/vite/`: mion vite preset: `mionVitePlugin`, Vue SFC pass, middleware mode.
- `src/next/`: mion Next preset: `withMion`, composed onto `src/runtypes/next/`.
- `src/options.ts`: what BOTH presets share, so a knob reaches vite and Next in one commit.
- `src/lint/`: one module, one `mion` plugin, one rule per diagnostic level.
- Presets (`src/vite/`, `src/next/`) = OPINIONATED: mion's choices (`emitMode` guard, batch transport).
  Plain adapters they sit on (`src/runtypes/vite.ts`, `src/runtypes/next/`) hold none.
- `src/options.ts` sits at src root on purpose: inside one preset would imply Next depends on vite. It does not.

## Two vitest projects, one package

- `vitest.config.ts` (project `devtools`): installs `mionVitePlugin` over `test/**/*.spec.ts`.
- `vitest.core.config.ts` (project `devtools-core`): runs `test/**/*.test.ts`, no plugin.
- Keep them separate: core suite through the mion transform would change what it exercises.
- Both named in `scripts/core/test-batches.mjs`. `pnpm run check:test-batches` fails if either goes unbatched.

## The lint entry is ESM only

- `src/lint/index.ts` top-level-awaits `prewarmSession()`: no CommonJS spelling, load bearing.
- Resolver launcher must fork while host process is small: once linting starts oxlint reserves tens of GB
  of address space and `fork()` fails with ENOMEM on Linux.
- Never add a `require` condition to `./eslint`.
- Default export = the `mion` plugin (oxlint's `jsPlugins` loads it). `configs.recommended` = ESLint's entry.
- How rules work + adding a code: [src/lint/AGENTS.md](src/lint/AGENTS.md). Read before touching `src/lint/`.

## The pure-fn artifact is synced from each bundler's post-bundle hook

- Every generate returns the package's `mion-pure-fns/` dir as a map, path → content.
- Contents: the package's pure-fn cache modules (same files as `<genDir>/types/pf/`) + `index.json`.
  A consumer's compiler serves from it, one module per demanded id.
- Plugin syncs it into the bundler's OUTPUT dir via `writePureFnArtifact` in `src/core/unplugin.ts`:
  - write a file only when its bytes changed;
  - delete every other file in the dir (dir is the build's, nothing else may live in it);
  - remove the dir when the package registers no pure fn.
- Sync must run from the hook that fires once the bundle is on disk.
  Generate runs at `buildStart`, before the bundler empties its output dir → any earlier write is lost.
- unplugin's universal `writeBundle` carries no arguments → each host names its own hook + output dir:
  - vite, rollup, rolldown: `writeBundle(outputOptions)` → `dir`, or dir of `file`. Once per environment.
  - esbuild: `esbuild.setup` + `build.onEnd` → `initialOptions.outdir`, or dir of `outfile`.
  - webpack, rspack: `compiler.hooks.afterEmit` → `compiler.options.output.path`.
  - bun (bundler host): `bun.setup` + `build.onEnd` → `build.config.outdir`. Runtime loader writes none.
  - next (Turbopack): the broker → Next's `distDir`. Invariant 8 in
    [src/runtypes/next/AGENTS.md](src/runtypes/next/AGENTS.md).
- No option to turn it off: the dir makes a published package's pure fns usable from another package.
  Missing → consumer fails with `purefn-package-not-built`.
- `files: ["dist"]` already ships it. `test/pure-fn-artifact.test.ts` drives every host.

## emitMode

- mion presets reject `emitMode: 'functions'` at config time: mion's client serializes compiled functions
  as strings → only `'code' | 'both'` valid.
- Unopinionated `runtypes/*` entries accept all three.
