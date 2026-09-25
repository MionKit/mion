# @mionjs/devtools guidelines

## ⚠️ This package is consumed COMPILED

Exports point to `./dist/` output, not source (except the two mion preset entries, which
also declare a `source` condition for in-repo test runs). The root eslint config loads the
`./eslint` entry through node, which never sees `source` — so other packages, and the
repo's own lint, always run the compiled JS.

- `dist/` is a gitignored build artifact; `pnpm run check:builds` rebuilds it when stale.
- After editing `src/`, rebuild BEFORE running other packages' tests or the root lint:
  `pnpm --filter @mionjs/devtools run build` (or `pnpm run check:builds`).
- The `devtools-core` suite imports source by relative path and needs no rebuild.

## ⚠️ devtools never depends on run-types

The dependency runs ONE way: `@mionjs/run-types` lists `@mionjs/devtools` as a dev dependency,
because its own tests run through the devtools vite plugin. devtools lists nothing from
run-types, in any `package.json` field. Adding it back makes a workspace cycle: pnpm warns on
every install and has to guess which package builds and tests first.

- **Nothing in `src/`, `test/` or the vitest configs imports `@mionjs/run-types`**, not even a
  type. A test that checks run-types behaviour (a validator accepting or rejecting a value, a
  mock matching its pattern) belongs in `packages/run-types/test`, written as plain TypeScript
  like the rest of that suite.
- **Fixture sources may name it.** A devtools test feeds the compiler a small project as text
  and checks what comes out (rewrites, diagnostics, generated modules). The compiler only
  matches markers declared in a package named `@mionjs/run-types`, so each fixture gets the
  REAL built package: `MARKER_PACKAGE_OVERLAY` / `writeMarkerPackage` / `createMarkerProject`
  in `test/helpers/inline.ts` copy `packages/run-types/dist` in by path. Never a hand-written
  copy of the types, it would drift.
- **A fixture that a bundler builds** installs the package as types only, so mark
  `@mionjs/run-types` external (rollup, vite, esbuild) or alias it to a small stub file
  (vite dev server). Build fixtures live in their own temp dir, never inside another package.

Two guards fail CI when this breaks: `pnpm run check:tree` (no workspace dependency cycle, in
`scripts/ci/check-tree.mjs`) and the "devtools code never imports @mionjs/run-types" case in
`test/repo-contracts.test.ts`.

### Build order

The two builds do not need each other: run-types builds with the `mion` CLI from
`@mionjs/bin-compiler`, devtools with `tsc`. The TESTS do:

- run-types tests load the devtools vite plugin from `packages/devtools/dist`, so devtools
  must be built first.
- devtools tests copy `packages/run-types/dist` into their fixtures, so run-types must be
  built first too.

`pnpm run check:builds` builds both when stale, and every `pretest` hook runs it. A missing
run-types dist fails the devtools suite with a message saying so.

## Scope

The two devtools packages in one, so this package carries the whole build-time surface:

| directory        | what                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| `src/core/`      | the resolver client, the transform, the edit buffer, codegen. Bundler agnostic |
| `src/runtypes/`  | the unopinionated adapter entries, one per bundler, plus `next/`               |
| `src/vite/`      | the mion vite preset: `mionVitePlugin`, the Vue SFC pass, middleware mode      |
| `src/next/`      | the mion Next preset: `withMion`, composed onto `src/runtypes/next/`           |
| `src/options.ts` | what BOTH presets share, so a knob reaches vite and Next in one commit         |
| `src/lint/`      | one module, two rule namespaces                                                |

`src/vite/` and `src/next/` are the OPINIONATED presets; `src/runtypes/vite.ts` and
`src/runtypes/next/` are the plain adapters they sit on. Same host, different level: the
preset holds mion's choices (the `emitMode` guard, the batch transport), the
runtypes one holds none.

`src/options.ts` sits at the src root rather than inside either preset on purpose. It is
what stops them drifting, and a shared module living inside one of its two consumers would
imply the Next preset depends on the vite one. It does not.

## Two vitest projects, one package

`vitest.config.ts` (project `devtools`) installs `mionVitePlugin` over `test/**/*.spec.ts`.
`vitest.core.config.ts` (project `devtools-core`) runs `test/**/*.test.ts` with no plugin.

Keep them separate. Running the core suite through the mion transform would change what it
exercises. Both are named in `scripts/core/test-batches.mjs` and `pnpm run check:test-batches`
fails if either goes unbatched.

## The lint entry is ESM only

`src/lint/index.ts` top-level-awaits `prewarmSession()`, which has no CommonJS spelling and
is load bearing: the resolver launcher must fork while the host process is still small,
because oxlint reserves tens of GB of address space once linting starts and `fork()` then
fails with ENOMEM on Linux. Do not add a `require` condition to `./eslint`.

One module, two namespaces: the default export is the `runtypes` plugin (what oxlint's
`jsPlugins` loads), `mionPlugin` carries the `@mionjs/*` rules, and `configs.recommended`
registers both. oxlint never reads `configs.recommended`, so that is ESLint's entry point.

## The pure-fn artifact is synced from each bundler's post-bundle hook

Every generate returns the package's `mion-pure-fns/` directory as a map, path to content: the
package's own pure-fn cache modules (the same files as under `<genDir>/types/pf/`) plus an
`index.json`, which a consumer's compiler serves from, one module per demanded id. The plugin
syncs it into the bundler's OUTPUT dir through `writePureFnArtifact` in `src/core/unplugin.ts`
(write a file only when its bytes changed, delete every other file in the directory, remove the
directory when the package registers no pure fn: the directory is the build's, nothing else may
live in it), and that sync must run from the hook that fires once the bundle is on disk:
generate runs at `buildStart`, before a bundler empties its output dir, so writing there any
earlier loses the files. unplugin's universal `writeBundle` carries no arguments, so each host
names its own hook and reads its own output dir:

| host                   | hook                                                           | output dir                                               |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| vite, rollup, rolldown | `writeBundle(outputOptions)`                                   | `dir`, or the dir of `file`; once per environment        |
| esbuild                | `esbuild.setup` + `build.onEnd`                                | `initialOptions.outdir`, or the dir of `outfile`         |
| webpack, rspack        | `compiler.hooks.afterEmit`                                     | `compiler.options.output.path`                           |
| bun (bundler host)     | `bun.setup` + `build.onEnd`                                    | `build.config.outdir`; the runtime loader writes none    |
| next (Turbopack)       | the broker, after `buildStart` and on the first loader request | Next's `distDir`; best effort, an app is never installed |

A package that registers no pure fn gets no directory, and a stale one is removed. There is
no option: the directory is what makes a published package's pure fns usable from another
package (a consumer reaching a package without it fails with `PFE9016`), and `files: ["dist"]`
already ships it. `test/pure-fn-artifact.test.ts` drives every host.

## emitMode

`emitMode: 'functions'` is rejected at config time by the mion presets — mion's client
serializes compiled functions as strings, so only `'code' | 'both'` are valid. The
unopinionated `runtypes/*` entries accept all three.
