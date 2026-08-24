# Freeze ts-run-types and land the unrelated-histories join (merge master plan, step 2)

**Status:** done (landed via the join PR, 2026-08-24)
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


## What shipped (record, 2026-08-24)

Landed as one 2-parent merge commit plus focused follow-up commits on
`feature/join-ts-runtypes-history`; both pre-merge heads tagged
(`pre-merge-mion`, `pre-merge-ts-run-types`). Conflict resolutions followed the
matrix above, with these deviations and findings discovered during the work:

- **LICENSE was NOT the same MIT text** (ts-run-types carried the proprietary
  RunTypes Small Organization License). Owner decided **MIT for everything**:
  root LICENSE is MIT, the three @ts-runtypes manifests, their READMEs, the
  binary-package README template and the source headers now say MIT.
- **The examples tsconfigs could not be unioned** (NodeNext+composite vs
  bundler+noEmit). The mion programs (`tsconfig.json`, `tsconfig.check.json`,
  its eslint config) exclude the runtypes example files; a new
  `tsconfig.runtypes.json` type-checks exactly those files and the root
  `typecheck` script points at it. Step 4 reorganizes the trees.
- **Formatter/linter scoping**: oxfmt/oxlint ignore the mion package dirs
  (`.oxfmtrc.json` / `.oxlintrc.json`); mion's prettier/eslint scripts (kept as
  `:mion` names) cover only the mion dirs; the `.editorconfig` 4-space TS rule
  is scoped to the mion dirs (oxfmt honors editorconfig and would otherwise
  reformat all runtypes files); `packages/examples` .ts files are
  formatting-frozen. Step 3 unifies.
- **ci.yml's commitlint job now lints only the PR's first-parent commits** — a
  plain base..head range would re-lint all 2,039 imported commits (956 historic
  violations, verified locally).
- **Latent bug fixed** (`fix(devtools)`): the Next broker and two tests passed
  a bare `{framework: 'webpack'}` unplugin meta that the real
  UnpluginContextMeta rejects; the type had collapsed to `any` because rollup
  was absent from ts-run-types' node_modules. Surfaced by the merged install
  (mion pulls rollup 4.62.2).
- **Pre-existing flake fixed** (`fix(devtools)`): the Next broker's transform
  path refreshed the invalidation stamp through the 100ms watcher throttle, so
  back-to-back transforms on a fast machine returned a stale stamp.
- **vite 8 regression fixed** (`fix(devtools)`): middleware mode's hot-reload
  lane broke under vite 8's realpath'd module graphs (macOS /var vs
  /private/var) and ssr-environment cache; the watcher lookup, reload
  invalidation and isOwnFile are now realpath- and environment-aware. The
  committed `packages/devtools/build/` output was rebuilt (layout also changed
  under the new toolchain; all export targets verified).
- **vite 8 edge-bundle hazard deferred to step 3** with a full record in
  [unify-workspace-and-toolchain.md](../todos/unify-workspace-and-toolchain.md):
  test-server pins `vite: 7.3.2` locally so its edge/cloudflare bundles keep
  rollup semantics; the underlying runtypes-runtime divergence is only fixable
  once the bundles inline the workspace source.
- **Lockfile**: regenerated from the ts-run-types lockfile as base via
  `pnpm install --no-frozen-lockfile` under pnpm 11.8.0; every mion dep passed
  the 30-day release-age policy, no new exclusions.

Green bar at landing: Go suite, full 15-project vitest suite (10,294 tests),
bun tests, oxfmt/prettier format checks both sides, oxlint + full typecheck,
mion eslint via lerna, check-code-imports, check-types-examples, commitlint
(first-parent), GHCR image pull verified from the host.
