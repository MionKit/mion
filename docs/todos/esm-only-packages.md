---
type: chore
spec: guidelines
status: ready
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

- No published `@mionjs/*` package ships a `require` build, and a CJS consumer loads each one in the pre-publish e2e.
- The dev `503` body carries no ANSI codes, pinned by a test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
