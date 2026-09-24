---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# Private Prefix on Private Package Dirs

## Intent
Rename every private package dir under `packages/` with a `private-` prefix, so it is obvious at a glance they are never published.

## Direction
- Private today (`"private": true`): `examples`, `go-be-sidecar`, `test-router-fuzz`, `test-server`, `type-budget` → `private-examples`, etc.
- Dirs only: decide with the user whether npm names (`@mionjs/test-server`, ...) change too; default keep.
- Paths are named in many places: `vitest.config.ts`, `scripts/core/test-batches.mjs`, `scripts/ci/lanes.mjs`, workflows, tsconfig references, `repo-contracts.test.ts`, the website `<code-import>` paths into `packages/examples/src/`, CLAUDE.md files and skills. A repo-wide grep finds them all.
- Add a contract test: every `private: true` package dir starts with `private-` and no published one does.
- The implementer plans the details.

## Docs
Website `<code-import>` paths into the examples package change (every page importing an example). No wording changes. CLAUDE.md and SETUP.md links update too.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- All five dirs renamed, nothing in the repo points at an old path.
- The new contract test passes; `pnpm test`, `pnpm run typecheck`, `pnpm run lint` pass; the website builds (label `website`).
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
