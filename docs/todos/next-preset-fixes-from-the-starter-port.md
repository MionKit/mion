---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# `withMion` fixes found porting the Next.js starter

## Intent

The documented Next.js setup does not work as written, and several lanes break silently. All found while porting
the mion-starters Next.js starter to 0.13.2; investigation in the mion-starters repo,
`docs/investigations/mion-0.13-migration/nextjs.md` issues 2-4, 8-10 (README rows 8-12), repro
`repros/dev-program-collapse.sh`.

1. **Config loading.** Next compiles `next.config.ts` to CommonJS, and `@mionjs/devtools`'s `./next` export has only
   `import`, so the documented `next.config.ts` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` (and its top-level
   `await` could not work in CJS anyway). `next.config.mts` / `.mjs` work.
2. **Typing.** `withMion(nextConfig: Record<string, unknown>)` rejects a `NextConfig`-typed object (TS2345) and
   widens the return type.
3. **`next dev --webpack` gets no transform.** `isTurbopack()` defaults to true unless argv has `--webpack`, but
   Next 16 forks the dev server and the child has neither the flag nor `TURBOPACK`. Webpack builds are fine.
4. **First clean build fails on Next 16.4.** `withMion` resolves before the scan creates `.mion/`; Turbopack 16.4
   caches the missing folder (69 "Can't resolve .mion/types"). The doc comment says the await waits for the scan.
5. **Intermittent "source file not in program" in dev** after edits, then missing `.mion` modules until restart.
   Suspected (not proven): on source drift the loader path calls `setSources` with one file, which the same file's
   comment says collapses the program.
6. **Misleading dual-load warning.** Every Next app prints `@mionjs/core has been loaded N times … ssr.noExternal`,
   advice that only applies to Vite; `serverExternalPackages` removes it.

## Direction

The implementer plans the fixes. Verified pointers:

- `packages/devtools/package.json` `./next` export; docs example
  `packages/private-examples/src/codegen/next-config.ts`. mion's Next smoke app
  (`container/pre-publish-e2e/apps/smoke-next/next.config.mjs`) uses `withRunTypes`, so `withMion` and the
  documented filename are untested: add a `withMion` lane, ideally with webpack dev too.
- `packages/devtools/src/next/index.ts:32, 45` (types).
- `packages/devtools/src/runtypes/next/index.ts:44-48` (Next sets `TURBOPACK` whenever it uses Turbopack, see
  `next/dist/lib/bundler.js`).
- `packages/devtools/src/runtypes/next/broker.ts:155` (`ready` not awaited; read
  `packages/devtools/src/runtypes/next/AGENTS.md` invariants first, creating `genDir` synchronously may be enough).
- `packages/devtools/src/core/unplugin.ts:477-481` vs `:736-739`; `broker.ts:339` (handle awaits whichever
  `hotUpdate` promise exists). Reproduce first.
- `packages/core/index.ts:13-22` (warning text), or recommend `serverExternalPackages` in the Next docs.

## Docs

`container/website/content/01.rpc/07.devtools/03.nextjs.md`: the config example filename and code, "Turbopack and
webpack", "Options" (typed config), and wherever `serverExternalPackages` is recommended.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The documented Next config works as written; `next dev` and `next build` work on both bundlers, first clean
  build included, on the Next versions mion supports, pinned by an e2e lane.
- The dev "source file not in program" collapse is reproduced and fixed, or disproved with the real cause found.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
