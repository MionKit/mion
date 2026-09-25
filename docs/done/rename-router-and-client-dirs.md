---
type: chore
spec: guidelines
status: done
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

## What shipped
- The folders are `packages/rpc-router` and `packages/rpc-client`. npm names and vitest project names are unchanged, so `scripts/core/test-batches.mjs` and `scripts/ci/lanes.mjs` needed no edit.
- Paths fixed in `vitest.config.ts`, the root `tsconfig.json` references, the root `package.json` eslint and lint-staged globs, the `../router/` hops in the rpc-client and private-test-server tsconfigs, `scripts/website/gen-client-size.mjs`, `scripts/website/bench-data/mion-bench.mjs`, the twoslash mount list, the website `<code-import>` paths, Go and TS comments, CLAUDE.md files, README.md, the review-pr skill, and open todos. The lockfile moved with `pnpm install`.
- `scripts/release/e2e.mjs` now finds a package folder by its npm name through `readWorkspacePackages()`; it used to guess `packages/router` from `@mionjs/router`.
- The root `tsconfig.json` alias `@mionjs/*` → `./packages/*` assumed folder = npm name, and Bun follows it with no fallback, so the platform-bun suite could not load `@mionjs/router`. The alias now lists every package whose folder differs (the two rpc folders and the five `private-` ones, which the earlier rename left broken the same way). Contract test: "the root tsconfig maps every @mionjs name to its own folder" in `packages/devtools/test/repo-contracts.test.ts`.
- Folder-name test fixtures updated: the typecheck-coverage fixture in `repo-contracts.test.ts` and the workspace check in `packages/devtools/test/test-pr.test.ts`.
- `docs/done/` keeps the old paths as history. Fixture strings like `../client/tsconfig.json` in devtools tests and examples are made-up paths and stay.
