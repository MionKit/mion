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

`vitest.config.ts` (project `devtools`) installs `mionVitePlugin` over `src/**/*.spec.ts`.
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

## emitMode

`emitMode: 'functions'` is rejected at config time by the mion presets — mion's client
serializes compiled functions as strings, so only `'code' | 'both'` are valid. The
unopinionated `runtypes/*` entries accept all three.
