---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# Rename Router and Client Dirs to rpc-router and rpc-client

## Intent
Rename `packages/router` → `packages/rpc-router` and `packages/client` → `packages/rpc-client`, to match the rpc naming. Dirs only: the npm names `@mionjs/router` and `@mionjs/client` stay the same.

## Direction
- Paths are named across the repo (about 100 files mention `packages/router` or `packages/client`): vitest projects, `scripts/core/test-batches.mjs`, `scripts/ci/lanes.mjs`, workflows, tsconfig build references, `repo-contracts.test.ts`, container e2e setups, CLAUDE.md files and skills.
- Vitest project names in `test-batches.mjs` (`router`, `client`, `client-bundled`, `client-mixed`) may stay; decide.
- Best done after the client middleware chain lands, to avoid rebase pain on the client package.
- The implementer plans the details.

## Docs
None on the website, because users see only npm names. CLAUDE.md and SETUP.md links update.

## Done when
- Both dirs renamed, nothing points at an old path, npm names unchanged.
- `pnpm test`, `pnpm run typecheck`, `pnpm run lint` pass; `pre-publish-e2e` label run passes.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan — rename (approved 2026-09-25)
- Folders only: npm names and vitest project names (`router`, `client`, `client-bundled`, `client-mixed`) stay, so `scripts/core/test-batches.mjs` needs no edit.
- `docs/done/` keeps old paths as history; open `docs/todos/` and `docs/maybe/` specs are updated.
- `git mv` both folders; rewrite `packages/router|client` paths, the `../router/` tsconfig hops, the root eslint and lint-staged globs, and the twoslash mount list; regenerate the lockfile with `pnpm install`.
- Fix `scripts/release/e2e.mjs`, which guessed a folder from the npm name (`@mionjs/router` → `packages/router`): look the folder up in the workspace instead.
