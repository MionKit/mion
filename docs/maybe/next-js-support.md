# Next.js integration — webpack path + Turbopack loader-rules path

**Status:** maybe — moved out of the OXC migration follow-ups todo on 2026-07-22 (originally created 2026-07-04; that todo has since been dropped).

Motivation: let a Next.js app (with or without Turborepo orchestration) consume
RunTypes end-to-end. Next.js ships two bundlers today; RunTypes needs a story
for each. **NB:** verified against Next.js 16.2 docs
([turbopack config reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)) —
Turbopack does NOT support esbuild plugins. It's a Rust bundler with its own
loader-rules extensibility model; do not confuse with Rspack (which is
esbuild-plugin-compatible) or unplugin's `.esbuild` adapter.

## Webpack path — works today, only needs docs

The plugin already ships a `/webpack` unplugin entry. Next.js's `webpack(config)`
hook accepts webpack plugins directly:

```js
// next.config.js
const RunTypes = require('ts-runtypes-devtools/webpack');
module.exports = {
  webpack(config) {
    config.plugins.push(RunTypes.default({ /* plugin options */ }));
    return config;
  },
};
```

**Action:** add a "Next.js" section to the website configuration page with
this snippet + smoke-test it against a fresh `create-next-app` so we catch
any Next-specific rewrite / module-resolution edge cases before users do.

## Turbopack path — real, but non-trivial (custom loader + entry-module materialization)

Turbopack has no plugin API, but Next.js 16.2 exposes a webpack-loader-shaped
escape hatch that is powerful enough to run RunTypes' transform. The relevant
surface (from the official docs):

- **`turbopack.rules`** — file-path / content / query / contentType-conditioned
  loader rules; loaders must return JavaScript (fine for us — our transform
  output is `.ts`/`.js`).
- **`turbopack.resolveAlias`** — module resolution aliasing (webpack
  `resolve.alias` equivalent). Handles the `virtual:rt/*` import IDs the
  rewrite injects — alias them to real files.
- **Inline `with { turbopackLoader, turbopackAs, turbopackModuleType }`** import
  attributes (Next.js 16.2+) — per-import loader application.
- **Missing loader-API bits that force design changes:** no `emitFile`,
  partial `fs` (only `fs.readFile`), no `resolve` context (only `getResolve`).
  This means a Turbopack loader **cannot emit new modules on its own** — the
  entry-module data bundle (`virtual:rt/runtypes.js` + per-root facades) must
  be **materialized to disk** by a separate pre-step, not synthesized in-loader.

**Design sketch (a proper todo, not a five-line entry):**

1. **Pre-step: materialize entry modules to `.next/rt/`.** Before `next dev` /
   `next build`, run a small orchestrator (either a Next.js `experimental.turbo`
   startup hook if one lands, or just `pnpm rtx next prepare`) that spawns the
   resolver binary in scan-only mode, computes the entry-module content, and
   writes real files under `.next/rt/`. Same content-addressed IDs as the
   in-memory bundle, so cache keys are stable.
2. **Turbopack loader for call-site rewrites.** Ship a
   `ts-runtypes-devtools/turbopack-loader` module that: reads source, spawns (or
   RPCs into) the resolver binary for the byte-offset edits, applies them via
   the JS `EditBuffer`, returns rewritten code + map. Wired via
   `turbopack.rules['*.{ts,tsx,js,jsx}']: { loaders: ['ts-runtypes-devtools/turbopack-loader'], as: '*.js' }`
   with a `{ not: 'foreign' }` condition so it skips `node_modules`.
3. **`resolveAlias` for entry-module virtual IDs.** Map `virtual:rt/runtypes.js`
   → `.next/rt/runtypes.js` (and per-root facades likewise). The rewritten
   source will then resolve them like ordinary files.
4. **HMR story.** Turbopack drives HMR itself; the pre-step needs to re-run
   (and rewrite the on-disk entry modules) when a scan reports `addedRunTypes`.
   Feasibility: unclear until the loader-side worker can call back into the
   binary's watcher — investigate before committing to a design.
5. **`transformMode: 'edits'` doesn't survive the loader boundary as-is** — the
   Go-side scan today runs once per Vite dev server; a Turbopack loader runs
   per-file with no shared state. Either (a) run the resolver as a persistent
   sidecar the loader RPCs into (mirrors what we do for Vite, but externalised),
   or (b) fall back to `'go'` mode per file and pay the process-per-transform
   cost. (a) is the right target.
6. **`unplugin` almost certainly won't help.** unplugin's model assumes a
   plugin API surface (compilation hooks, virtual modules); Turbopack exposes
   neither. Even if `unplugin.turbopack` ships, it will likely be a loader
   shim with the same constraints as above — worth a re-check when it lands,
   but do not block on it.

**When:** treat as a real project (probably 1–2 weeks of work + a fresh
Next.js example app), not a "flip a switch" task. Prerequisite: someone wants
to use RunTypes with `next build --turbopack` in production and is willing to
be the guinea pig for the sidecar model.

**Reference:** [vercel/next.js#81956](https://github.com/vercel/next.js/discussions/81956)
("What are all the ways to provide transform plugins to Next.js?") — general
survey confirming there is no formal Turbopack plugin API today.

## Turborepo is orthogonal (only a cache-inputs note)

Turborepo is a task orchestrator: it runs `next build` (or `vite build`, `tsc`, …)
and caches the output. It does NOT intercept the bundler, so there is no
"Turborepo entry" to add. The one Turborepo-specific concern is that its
remote cache keys on declared inputs — a RunTypes-consuming package's cache
must invalidate when the resolver binary version changes. Document adding the
pinned `ts-runtypes-bin` version (via `$TURBO_DEFAULT$` + a `globalDependencies`
entry, or the task's `inputs`) in `turbo.json`. Short note on the Next.js docs
page suffices.
