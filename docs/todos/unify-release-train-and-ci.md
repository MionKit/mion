# One release train and one CI (merge master plan, step 6)

**Status:** open
**Created:** 2026-08-24

Step 6 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Requires [unify-e2e-on-verdaccio.md](unify-e2e-on-verdaccio.md) landed (and step 4 for the
website-deploy hook). Goal (settled decision 2): every published package — 10 `@ts-runtypes/*` +
11 `@mionjs/*` — ships from one `version.json` lockstep train through the `main` → `prod` flow,
and the ts-run-types CI is THE repo CI.

## Owner actions

- Branch protections for `main` (rebase-merge PRs, required checks) and `prod` (merge-commit-only
  promotion; `publish.yml`'s `merge-shape` job enforces the commit shape, but the protection
  keeps humans honest).
- The first unified release's npm 2FA stage-approve (`pnpm rtx release stage-approve`), as for
  every release.

## Tasks

- **CI:** extend `ci.yml`'s `js-lint` lane with the mion suites (`test:ci` batches, `test:bun`,
  mion eslint, `check-code-imports` equivalent) — or a parallel `mion` job if runtime demands it;
  keep the paths-filter job in sync. Retire `.github/workflows/pull-requests.yml`. Extend
  `release-gate.yml`'s e2e job expectations to the enlarged matrix from step 5 (mostly free —
  the gate calls `rtx release e2e`).
- **Versioning:** `@mionjs/*` joins `version.json` lockstep. `bump-version.mjs` already stamps
  every `packages/*/package.json`; verify it handles the mion set (including private ones like
  `test-server` and `examples`, which move to the same version like the runtypes private
  packages do). First joint version: next minor above 0.12.2 (e.g. 0.13.0); `@mionjs/*` jumps
  from 0.8.10, which npm is fine with.
- **Publish flow:** extend `publish-tarballs.mjs` / `publish.mjs` / `manual-publish.mjs` /
  `verify-live.mjs` / `unpublish.mjs` with the `@mionjs/*` set in dependency-safe order
  (runtypes first, then `@mionjs/core`, then its dependents). `stage-approve.mjs`'s leaves-first
  walk gains the new packages. Delete mion's `scripts/publish.sh` and `scripts/unpublish.sh`.
- **`prod` branch:** create it from `main` at the first release cut; `pre-publish.yml` /
  `publish.yml` / the release-to-prod skill then apply unchanged. Note for the first release:
  `main-ancestor` and `version-fresh` jobs must pass with the joined history (the version check
  queries npm for the new version across ALL packages — extend its package list).
- **Changelog:** git-cliff (`cliff.toml`) covers the whole repo from now on; mion's pre-merge
  history predates conventional commits, which is fine — the tag pattern starts the changelog at
  the runtypes tags. Commitlint (already enforced by `ci.yml` on PRs) now governs mion work too.
- Update the release-to-prod skill's package expectations and CLAUDE.md's publishing section.

## Done criteria

- A full dry pass: `rtx release preflight` → `pack` → `e2e` green with 21 packages.
- First unified release ships to npm through `pre-publish.yml` → `publish.yml` →
  stage-approve, and `post-publish.yml`'s live-registry e2e passes including the mion consumer.
- `verify-live` confirms every package at the unified version; the website deploy gate accepts it.
- No lerna-era or manual-publish scripts remain.
