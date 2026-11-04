---
type: chore
spec: guidelines
status: ready
created: 2026-11-04
---

# Remove what the starters migration left unused

## Intent

The mion 0.13 starters migration changed a lot in a short time: the `withMion` Next.js preset and its e2e app
went, packages went ESM-only with a Node >= 24 floor, router and core state moved off `globalThis`, the dev
reload was reworked, and the Vite `server.build` and packaging fixes landed. Each PR removed its own code, but
nobody swept the repo as a whole. Find and remove whatever is now dead, per the root `AGENTS.md` rule that a
removed thing leaves no trace.

## Direction

The implementer plans the sweep. Places to look, verified as having candidates on `main` (`fb729571d`):

- Next.js on the RPC side: remaining mentions outside the RunTypes Next adapter (which stays, with its docs, env
  knobs and `smoke-next` apps). For example the Next.js lines in the root `.gitignore`,
  `packages/platform-bun/.gitignore` and `packages/private-examples/.gitignore`.
- ESM-only and the Node floor: stale CommonJS wording, scripts, tsconfigs or comments (for example
  `packages/bin-uws/package.json` `comment:exports` still says ">= 22"), CI lanes or e2e fixtures that only
  existed for the CJS builds or Node 22.
- State off `globalThis`: helpers, env vars or tests that only served the shared state or the dual-load warning.
- Generally: unused exports, files, scripts, dependencies and devDependencies (`pnpm run check:tree`, knip or
  similar), dead options in `packages/devtools/src/options.ts`, stale docs and AGENTS.md lines.

Keep: anything RunTypes uses on its own (the Next adapter, its env knobs), and anything a test proves still used.
When unsure whether something is dead, list it in the PR instead of deleting it.

## Docs

Only pages that describe removed things; otherwise none.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every candidate is removed or listed in the PR with why it stays; lint, typecheck and the full test suite pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
