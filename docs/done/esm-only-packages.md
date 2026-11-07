---
type: chore
spec: guidelines
status: done
created: 2026-11-02
---

# Ship the @mionjs packages ESM-only, so a process can never load two copies

## Intent

Router and core state now lives in each module copy, never on `globalThis`: a dev reload is a fresh copy, so
nothing has to be reset. The one way left to get two copies by mistake is the dual build every package ships:

```json
// packages/rpc-router/package.json exports["."]
{"require": "./.dist/cjs/index.cjs", "default": "./.dist/esm/index.js"}
```

A `require('@mionjs/router')` in one place and an `import` in another load two separate routers, and routes
registered in one are invisible to the other ("route not found", with no warning: the old dual-load warning went
with the shared state). Node 20.19+ and 22.12+ `require()` an ESM-only package, so dropping the `require` builds
closes the hole for good. The maintainer chose to do it as its own packaging change.

Same packaging pass: the in-process dev API's `503` body (`fail()` in `packages/devtools/src/vite/middlewareMode.ts`)
prints `err.message` as is, ANSI colour codes included, which a browser shows as garbage.

## Direction

The implementer plans the details.

- Every `@mionjs/*` package: drop the `require` condition and the `.dist/cjs` output (`cjsPackageJsonPlugin`,
  the cjs rollup output in each `vite.config.ts`), keep `types` + `default`. `@mionjs/run-types` has its own second
  `tsc` pass (`tsconfig.cjs.json`). Check what still needs a CommonJS entry (Next loads `next.config` as CJS,
  Turbopack resolves loaders with `require` conditions: `@mionjs/devtools`'s `default` condition on purpose).
- Decide the Node floor this sets for consumers (`engines`), and say it on the website.
- The pre-publish e2e consumer lanes (`container/pre-publish-e2e/`, label `pre-publish-e2e`) prove a CJS consumer
  still loads each package through `require(esm)`.
- 503 body: strip ANSI escape codes before writing it, with a test in `packages/devtools/test/vite/middlewareMode.spec.ts`.

## Docs

The install / requirements page states the Node floor. Before opening the PR, run the simplify-docs pass (the
`docs-simplifier` subagent) over every page and example this change touched, review its report against the code,
and commit it as its own commit.

## Done when

- No published `@mionjs/*` package ships a `require` build, and a CJS consumer loads each runtime package in the
  pre-publish e2e (devtools + bin-compiler stay import-only build tooling).
- The dev `503` body carries no ANSI codes, pinned by a test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: ESM-only packages (approved 2026-11-03)

Decisions from planning with the maintainer:

- Node floor `>=24` in `engines` of every published package, stated on the manual-install page and pinned by a
  repo-contracts test. platform-bun keeps its `bun` engine. platform-uws + bin-uws drop the Node 22 range
  (`>=24 <25 || >=26 <27`), and the Node 22 (ABI 127) uWebSockets.js binaries are no longer fetched or shipped.
  The Google Cloud Functions page deploys on `nodejs24`.
- No duplicate-copy detection. A dev reload loads a fresh copy by design, and dropping the CJS build removes the
  CJS + ESM double, so there is nothing left to disable. The dev middleware guard that spots a second router opening
  its own port stays.

Build:

1. core, router, client and the seven platform packages: drop every `require` export, the cjs rollup output and
   `cjsPackageJsonPlugin` from each `vite.config.ts`.
2. run-types: flat `source` / `types` / `default` exports; delete `tsconfig.cjs.json`, `scripts/lib/emit-cjs-pkg.mjs`,
   the `dist/cjs` hollowing pass, its tsgo-check entry and `dualPackageTypes.test.ts`.
3. devtools: delete `cjsPackageJsonPlugin` and its `@mionjs/devtools/vite` export. The Next adapter stays.
   Also gone: the tsc-only exemption in `scripts/core/tsgo-check.mjs` (its one entry was the CJS pass), the CJS call
   shape in the run-types hollowing script, the root `tsconfig.json` `.dist/cjs` outDir, and the website twoslash
   loader's `dist/cjs` filter.
4. `fail()` in `middlewareMode.ts` strips ANSI codes with `stripVTControlCharacters`, pinned in
   `middlewareMode.spec.ts`.
5. Pre-publish e2e, in the mion lane's `packaged-sources.spec.ts`: no manifest has a `require` condition, a
   `createRequire` consumer loads every exported subpath of every published package (platform-bun included: its
   `bun` import is type-only), and a `.cts` file doing `import x = require(...)` type-checks under `module nodenext`
   (TypeScript >= 6, the devtools peer floor). Skipped: the drizzle dialects' `./drizzle` subpath (re-exports the
   optional upstream `drizzle-orm` peer, not installed there).
6. Stay `import`-only build tooling, never `require()`d: `@mionjs/devtools` (its `./eslint` entry awaits at the top
   level) and `@mionjs/bin-compiler`. The Next loader keeps its `default` condition for Turbopack.
