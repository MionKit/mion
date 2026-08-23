# Pre-merge cleanup of mion (merge master plan, step 1)

**Status:** open
**Created:** 2026-08-23

Step 1 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Goal: shrink the merge surface and stop dead weight from traveling through the
upcoming unrelated-histories join with ts-run-types. Everything here is a normal
PR against the current default branch; nothing depends on the merge itself.
All file references verified on 2026-08-23.

## Prerequisite (owner)

Rename the default branch `master` → `main` in GitHub settings (Settings →
Branches → rename). GitHub re-targets open PRs and shows the update hint for
local clones automatically. The in-repo reference fixes below assume the rename
has happened; if it hasn't yet, land them anyway — they are forward-compatible
only for the README links, so the `nuxtjs.yml` / `nx.json` edits must wait for
it or deploys/nx will look at a branch that no longer receives pushes.

## Tasks

### Delete dead files

- `setup.sh` — npm-workspaces/jest/apt era, contradicts the pnpm-only policy.
- `jest.config.js` — nothing references jest anywhere (no dependency, no
  script; eslint explicitly ignores the file).
- `AGENTS.md` — stale sibling of CLAUDE.md: npm-era commands, lists removed
  packages, and still carries the deepkit-era "never use `import type`" warning
  that CLAUDE.md explicitly reverses.
- `.augment-guidelines.md` and `.augment/` — same stale lineage.
- Do NOT touch `plans/` (settled: it is an ideas folder, not a todo backlog).

### test-publish stale remnants

- `test-publish/pnpm-workspace.yaml`: remove the overrides for removed packages
  `@mionjs/run-types` (line 17) and `@mionjs/type-formats` (line 21) — their
  tarballs are never produced by `scripts/pack-packages.sh`; remove the
  `@deepkit/type-compiler: false` allowBuilds entry (line 43) and its
  explanatory comment block (deepkit is gone).
- `test-publish/pnpm-lock.yaml` still carries `@mionjs/run-types` entries.
  Regenerating it needs the tarballs present: run `scripts/pack-and-install.sh`
  (build + pack + install) and commit the resulting lockfile.
- `test-publish/CLAUDE.md`: fix references to things that no longer exist —
  `pnpm run test:aot` (now `test:build-output`), `src/tests/aot-build.spec.ts`
  (now `src/tests/build-output.spec.ts`), `src/client/pureFns.ts` (gone), and
  the `verify` script description (lines 35-44).

### Config fixes

- `eslint.config.js` line 23: ignore path `packages/test-publish/**` is stale —
  the directory is root-level `test-publish/**`.
- `.claude/settings.local.json`: 4 permission entries hardcode
  `/Users/majerez/Projects/mion/...`; replace with relative forms or drop them.
- `CLAUDE.md` line 17: drop `@mionjs/run-types` from the caret-range peer-deps
  list (package no longer exists in the repo).
- `CLAUDE.md`: add one line documenting `plans/` as a loose-ideas folder exempt
  from the `docs/todos|done` workflow, so it stops being flagged as stale.
- `docs/done/migration-overview.md`: the "Version status (2026-08-20)" section
  says 0.12.0; the pinned version is 0.12.2. Note the bump; also note that its
  `../todos/` links resolve again now that `docs/todos/` exists.

### Default-branch reference updates (after the owner rename)

- `.github/workflows/nuxtjs.yml` line 10: `branches: ['master']` → `['main']`.
- `nx.json` line 26: `"defaultBase": "master"` → `"main"` (nx dies in step 3,
  but it must not point at a dead branch in the meantime).
- `raw.githubusercontent.com/MionKit/mion/master/...` asset URLs → `main` in:
  root `README.md` and `packages/{client,core,drizze,examples,platform-aws,
  platform-bun,platform-gcloud,platform-node,router}/README.md`.

### npm

- Do NOT deprecate `@mionjs/run-types` (still live at 0.8.10). Settled with the
  maintainer 2026-08-23: the name may become the future home of
  `@ts-runtypes/core` if the packages are ever re-unified under it, so it stays
  exactly as it is.

## Done criteria

- `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run check-format`,
  `pnpm run test:ci` all green (the pull-requests.yml gate).
- `scripts/pre-publish-test.sh` still passes end to end (it exercises the
  test-publish lockfile this spec regenerates).
- Repo-wide grep for `run-types` finds only deliberate/documentary mentions
  (migration records, the devtools removed-options guard, spec files) — no
  config or lockfile entries.
- `master` receives no further pushes; CI and Pages deploy run from `main`.
