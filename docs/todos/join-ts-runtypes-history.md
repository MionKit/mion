# Freeze ts-run-types and land the unrelated-histories join (merge master plan, step 2)

**Status:** open
**Created:** 2026-08-24

Step 2 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Goal: bring the FULL commit history of `MionKit/ts-run-types` (1,991 commits, zero shared with
mion's 1,617) into this repo as one verifiable merge commit, with both test suites green, while
changing as little as possible — the toolchain unification is step 3, not here.

## Prerequisites

- Default branch renamed to `main` — DONE 2026-08-24.
- **Owner decision (master plan, decision 5):** the join is a real 2-parent merge commit and
  cannot land through a rebase-merge (it would be flattened). Either enable "Allow merge
  commits" in Settings → General → Pull Requests for a one-off merge-commit PR, or approve a
  direct push to `main`.
- **Owner:** make sure the GHCR packages `ghcr.io/mionkit/tsrt-website` and
  `ghcr.io/mionkit/tsrt-e2e` are pullable from THIS repo's Actions (they were published from the
  ts-run-types repo; grant the mion repo access under the org package settings, or make them
  public). ts-run-types' `ci.yml` smoke job and the release gate pull them and never build them.
- Freeze ts-run-types: land or explicitly abandon anything open there; confirm the tree matches
  published 0.12.2 (true as of 2026-08-23). After the join, that repo receives no more commits.

## Mechanics

1. Tag the pre-merge heads so the join point stays findable: `pre-merge-mion` on mion `main`,
   `pre-merge-ts-run-types` on ts-run-types `main`; push both tags.
2. In a mion clone (NOT shallow — `git fetch --unshallow` first if needed):
   `git remote add rt https://github.com/MionKit/ts-run-types && git fetch rt --tags`, branch off
   `main`, then `git merge rt/main --allow-unrelated-histories`.
3. `.gitmodules` and the `ts-go-runtypes/third_party/tsgolint` submodule pointer arrive from the
   ts-run-types side with no conflict. After the merge: `git submodule update --init --recursive`
   plus `pnpm rtx` / `scripts/core/ensure-tsgolint.mjs` to apply the patches, then build
   `bin/ts-runtypes` and the dists (`pnpm run check:builds`).

## Conflict matrix (the 14 colliding paths, verified 2026-08-23)

**ts-run-types side wins:** `pnpm-workspace.yaml` (but KEEP `@ts-runtypes/*` in
`minimumReleaseAgeExclude` until step 3 switches to `workspace:*`, and carry over any
`allowBuilds` entries mion actually needs, e.g. esbuild), `.npmrc`, `.prettierrc` (identical
values anyway), `.husky/pre-commit` (both run lint-staged; `commit-msg` arrives as a new file).

**Union:**

- Root `package.json` — ts-run-types base (name, engines node ≥ 26, packageManager, rtx
  scripts). Add mion's devDependencies (lerna, nx, eslint stack, prettier; on the
  typescript 6.0.2 vs 6.0.3 clash take 6.0.3). Colliding script names (`test`, `lint`, `build`,
  `clean`, `fresh-start`) keep the ts-run-types meaning; mion's equivalents survive under a
  temporary `:mion` suffix (`lint:mion` → `lerna run lint`, …) that step 3 removes. mion-only
  scripts (`test:ci`, `test:bun`, `check-code-imports`, `check-types-examples`,
  `pre-publish-test`, `npm-publish`) carry over as-is.
- `.github/workflows/pull-requests.yml` — update its script calls to the `:mion` names in the
  same commit, or it silently runs the runtypes suite instead of mion's.
- Root `tsconfig.json` — union of project references (both sides), mion's `@mionjs/*` paths
  kept, ts-run-types' excludes (`ts-go-runtypes`, `bin`) kept.
- Root `vitest.config.ts` — union of projects (5 runtypes + 10 mion). Note this makes the
  ts-run-types `pretest` (Go binary + dists) a prerequisite of the FULL `pnpm test`.
- `packages/examples/tsconfig.json` — the only in-package collision. The two examples trees have
  no overlapping files; keep mion's `package.json` for the merged package and union the tsconfig
  `paths` so both example sets typecheck (runtypes examples resolve `@ts-runtypes/*` via paths to
  built dists; mion examples via workspace deps).
- `.gitignore` — union; mion's exception that commits `packages/devtools/build/` MUST survive.
- `.vscode/settings.json` — union.

**mion side wins:** `README.md` (this repo's GitHub landing page stays mion's, plus a short
RunTypes section pointing at the runtypes docs; the full rework is step 7). `LICENSE` (verify
both are the same MIT text first; if identical it's a non-choice).

**CLAUDE.md:** ts-run-types' becomes the spine (its rules describe the setup that now lives
here) with a clearly-marked temporary "mion packages" addendum: package list, devtools
committed-build/rebuild requirement, `test:ci` batching, `:mion` script names. Step 7 does the
real merge of the two documents.

**`pnpm-lock.yaml`:** never hand-merged — regenerate from the union manifests
(`@ts-runtypes/*@0.12.2` still resolves from npm in this commit; the switch to `workspace:*` is
step 3).

## Green bar (all before landing)

- `pnpm install` clean on the regenerated lockfile.
- `go -C ts-go-runtypes test ./internal/...` and `pnpm run check:builds`.
- Full `pnpm test` (all 15 vitest projects) — use the mion batching if one run OOMs.
- `pnpm run lint` + `pnpm run check-format` (runtypes scope) and `lint:mion` +
  mion `check-format` equivalent.
- Both workflow sets green on the PR (filenames don't collide; ts-run-types' `ci.yml` will
  trigger on PRs to `main` and must pass here too — its bootstrap action handles submodules,
  and the smoke job needs the GHCR access from Prerequisites).

## Landing

Per the owner's decision 5 choice: one-off merge-commit PR (never squash, never rebase) or
direct push to `main`. Immediately after landing, push a final commit to ts-run-types' README
saying development moved to MionKit/mion (the archive flip itself is step 7).

## Done criteria

- `git log` from `main` reaches both pre-merge tags; `git log --follow` works for a sample file
  from each side (e.g. `packages/router/src/router.ts` and
  `ts-go-runtypes/internal/reflection/`).
- The green-bar list above passes on `main` after landing.
- ts-run-types receives no further development commits.
