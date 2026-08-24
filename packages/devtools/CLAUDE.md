# @mionjs/devtools guidelines

## ⚠️ This package is consumed COMPILED

Exports point to `./build/` output, not source. The root eslint config loads the `./eslint` entry through node, which never sees the `source` export condition — so other packages (and the repo's own lint) always run the compiled JS.

- `build/` is a gitignored build artifact; `pnpm run check:builds` rebuilds it when stale.
- After editing `src/`, rebuild BEFORE running other packages' tests or the root lint: `pnpm --filter @mionjs/devtools run build` (or `pnpm run check:builds`).
- This package's OWN tests import source directly and need no rebuild.
- Use `pnpm --filter @mionjs/devtools run dev` for watch mode during active development.

## Scope

Thin wrapper over `@ts-runtypes/devtools`: the Vite plugin (`mionVitePlugin`, SFC/Vue transform, middleware mode, the `serverMapFrom` manifest) plus mion's own ESLint plugin (`strong-typed-routes` and friends). `emitMode: 'functions'` is rejected at config time — mion's client serializes compiled functions as strings, so only `'code' | 'both'` are valid.
