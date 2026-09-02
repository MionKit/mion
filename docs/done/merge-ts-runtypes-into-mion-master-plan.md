# Merge the ts-run-types repo into the mion monorepo (master plan)

**Status:** done (2026-09-02)
**Created:** 2026-08-23

This is the master plan for moving everything in `MionKit/ts-run-types` back into
`MionKit/mion`, keeping the full git history of both repos. Each numbered step below
becomes its own `docs/todos/` spec with a detailed plan before any code is written.
This document is the map, the ordering, and the list of decisions that must be made
before or during the move.

## Why

ts-run-types was extracted from mion to become a standalone library, but the
standalone path is being dropped (adoption effort, pressure to broaden the feature
set away from the TS-vertical design, and naming collisions with the well-known
"runtypes" library). The code comes home to mion. The ts-run-types repo has the
newer, better setup (skills, containers, verdaccio e2e, release automation, CI),
so after the merge the combined repo adopts the ts-run-types way of working, and
mion's older equivalents are retired.

## Evidence (facts the plan is built on)

Both clones were unshallowed and compared on 2026-08-23:

- **Histories are unrelated.** ts-run-types has 1,991 commits on `main`, mion has
  1,617 on `master`, zero shared commit hashes. Its first commit ("feat:
  compile-time type resolver for mion runtypes on ts-go") started fresh, so the
  join must be a `--allow-unrelated-histories` merge commit.
- **The collision surface is tiny.** Only 14 exact file paths exist in both repos,
  all root-level config (`package.json`, `pnpm-workspace.yaml`, `tsconfig.json`,
  `vitest.config.ts`, `pnpm-lock.yaml`, `CLAUDE.md`, `README.md`, `LICENSE`,
  `.gitignore`, `.npmrc`, `.prettierrc`, `.husky/pre-commit`,
  `.vscode/settings.json`) plus `packages/examples/tsconfig.json`. No package
  directory collides except `packages/examples`, and the two examples trees have
  no overlapping source files (both even use the same `src/_homepage` convention),
  so they union into one package.
- **The toolchains already agree.** Both are pnpm 11 workspaces with
  `packages: ['packages/*']`, exact pinning, `ignoreScripts`, 30-day
  `minimumReleaseAge`. Both websites are Nuxt 4.4.2 + Docus 5.9.0 + @nuxt/content
  3.12.0 with the same code-import pipeline. `.prettierrc` is identical on both
  sides (and ts-run-types' oxfmt mirrors it), so reformat churn will be small.
- **Both are lockstep-versioned.** mion via lerna (`0.8.10`, fixed, forcePublish);
  ts-run-types via `version.json` + `scripts/release/bump-version.mjs` (`0.12.2`).
  mion pins `@ts-runtypes/{core,devtools,bin}` at exactly `0.12.2` (the current
  npm latest), so the trees are in sync right now — the ideal moment to merge.
- **mion's e2e is local tarballs, no verdaccio, no CI publish.**
  `test-publish/` + `scripts/pre-publish-test.sh` + manual `scripts/publish.sh`
  (lerna, interactive OTP). ts-run-types has the full automated flow: verdaccio in
  the `tsrt-e2e` podman image, `rtx release e2e`, release-gate/publish workflows,
  staged npm publish with 2FA approval.
- **mion carried dead weight** that should not travel through the merge. All of the
  following was cleared by step 1 (see its record) except the npm package name, which
  stays live by decision 1: stale
  npm-era `setup.sh`, dead `jest.config.js`, stale `AGENTS.md` + `.augment*`
  (contains the reversed deepkit-era `import type` warning), `plans/` specs
  written against removed APIs (`aotCaches`, `virtual:client-mion-aot`),
  `test-publish` overrides for removed packages (`@mionjs/run-types`,
  `@mionjs/type-formats`), `docs/todos/` missing entirely while CLAUDE.md links
  it, `docs/done/migration-overview.md` saying 0.12.0 while the pin is 0.12.2,
  and `@mionjs/run-types@0.8.10` still live (undeprecated) on npm.
- **Repo-name references are enumerated.** `MionKit/ts-run-types` is hardcoded in
  the root/package `package.json` repository fields, package READMEs, both
  Containerfile `org.opencontainers.image.source` labels, the website
  `app.config.ts` github block, several content pages, `build-binaries.mjs`,
  `setup-claude-web.sh`, and `repo-contracts.test.ts`. GHCR coordinates
  (`ghcr.io/mionkit/tsrt-website|tsrt-e2e`) are org-scoped and unaffected by the
  move. The Go module path `github.com/mionkit/ts-runtypes` is also org-scoped
  and can stay.

## Target end state

One repo, `MionKit/mion`, laid out like ts-run-types today with mion's packages
joining the same `packages/` workspace:

- Full commit history of both repos reachable from the default branch.
- `ts-go-runtypes/` (Go resolver + tsgolint submodule + patches), `container/`
  (website, benchmarks, pre-publish-e2e), `scripts/` (`rtx` CLI), `.claude/`
  (hooks, skills, output style) — all carried over from ts-run-types unchanged in
  spirit, extended to cover the mion packages.
- `packages/` = `ts-runtypes`, `ts-runtypes-devtools`, `ts-runtypes-bin`,
  `ts-runtypes-go-be-sidecar`, `examples` (merged) + `core`, `router`, `client`,
  `devtools`, `drizzle`, `platform-*`, `test-server`. `@mionjs/*` packages depend
  on `@ts-runtypes/*` via `workspace:*`, not npm pins.
- One Nuxt install (`container/website/`) building TWO separate sites from two
  content trees — mion.pages.dev and runtypes.pages.dev, both on Cloudflare
  Pages; the host-run `website/` directory and the GitHub Pages deploy are gone.
- One e2e gate: verdaccio in the `tsrt-e2e` image publishes and exercises the
  `@ts-runtypes/*` AND `@mionjs/*` tarballs; `test-publish/` is gone.
- One release train: `version.json` lockstep across every published package,
  `main` → `prod` release flow, staged npm publish, git-cliff changelog,
  commitlint enforced.
- CLAUDE.md follows the ts-run-types rules with a mion-specifics section; stale
  mion guidance (AGENTS.md and friends) deleted.
- The ts-run-types GitHub repo archived with a pointer README.

## Decisions (settled with the maintainer, 2026-08-23)

1. **npm package names: keep `@ts-runtypes/*`** published from the mion repo. A
   rebrand, if ever, is a separate later project — one candidate being a return
   to the `@mionjs/run-types` name, which therefore stays live and undeprecated
   on npm.
2. **One version train.** `bump-version.mjs` stamps every
   `packages/*/package.json`; `@mionjs/*` jumps from 0.8.10 to the next unified
   version at the first joint release.
3. **Two sites from one Nuxt install.** The same `container/website/` codebase
   builds two separate static sites from two content trees: mion.pages.dev and
   runtypes.pages.dev, both Cloudflare Pages. mion's GitHub Pages deploy is
   retired.
4. **Default branch renames to `main`; `prod` is created for the release line.**
   The rename itself is a one-click GitHub settings action (owner); everything
   in-repo is handled inside the migration steps.
5. **The join commit** lands via a one-off merge-commit PR or a direct push to
   `main` — the owner either flips the "allow merge commits" repo setting for
   that PR or green-lights the direct push at step 2 time.
6. **`plans/` is gone (superseded 2026-08-30).** It was kept through the merge as an
   ideas folder, not a todo backlog. Its specs later went stale; the only one still
   worth keeping, `client-missing-features.md`, moved to `docs/maybe/` and the rest
   were deleted. `docs/maybe/` is now the only parked-ideas lane.
7. **mion benchmarks move into the repo** (from the sibling `mion-benchmarks`
   repo). Originally planned as the LAST step, gated on the first unified release;
   the maintainer LIFTED that gate on 2026-08-25 and step 8 shipped before steps 6
   and 7. The gate rested on the benchmarks consuming published `@mionjs/*`
   packages, which they do not: the first-party packages are bind-mounted into the
   container at run time, so the numbers describe the current tree.

### Owner-only actions (everything else is agent work)

- Before step 2: rename the default branch `master` → `main` in GitHub settings.
- At step 2: allow the one merge commit to land (setting flip or direct-push OK).
- At step 4: create the Cloudflare Pages project for mion.pages.dev and make
  sure the existing `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets
  cover it.
- At step 6: branch protections for `main`/`prod` (merge-commit-only promotion,
  required checks) — recommended, and only the owner can set them.
- At release time: the npm 2FA stage-approve, exactly as ts-run-types does today.

## Steps

Each step is one `docs/todos/` spec + one PR (except step 2, which is the join
commit itself). Order is load-bearing: every step leaves the repo green
(install, build, both test suites, lint) so the migration can pause safely at
any boundary.

### Step 1 — Pre-merge cleanup of mion ✅ DONE

Shipped 2026-08-23 — record in
[premerge-cleanup-of-mion.md](premerge-cleanup-of-mion.md). It went
further than planned: besides the listed deletions and config/doc fixes, it removed
the dead AOT/deepkit-era type vocabulary still exported by `@mionjs/core` and
`@mionjs/router`, three unused root devDependencies, the last jest dependency, twelve
orphaned example files, and `website/.vscode-extension/`. It also fixed a red publish
gate (`test-publish` specs still using the client's old 4-tuple result) and a second
failure hidden behind it. `plans/` and `assets/` were left untouched.

The `master` → `main` reference updates did NOT ship — they are blocked on the owner
rename and are tracked in
[default-branch-rename-references.md](default-branch-rename-references.md).

### Step 2 — Freeze ts-run-types and land the join commit ✅ DONE

Shipped 2026-08-24 — record in
[join-ts-runtypes-history.md](join-ts-runtypes-history.md). The join landed
as planned plus: the LICENSE conflict was real (proprietary vs MIT; owner chose MIT for
everything), three latent/toolchain bugs in devtools were found and fixed in the PR, and one
vite 8 edge-bundle hazard is recorded in
[unify-workspace-and-toolchain.md](unify-workspace-and-toolchain.md) for step 3.

- Land or explicitly abandon any open work in ts-run-types; confirm the tree
  matches published 0.12.2 (it does today). From then on ts-run-types is frozen —
  all work happens in mion.
- In mion: `git remote add rt <ts-run-types>`, `git fetch rt`, then
  `git merge rt/main --allow-unrelated-histories` on a branch. Resolve the 14
  file conflicts per the matrix in the step spec — broadly: ts-run-types wins
  the toolchain configs, unions for `package.json` / `tsconfig.json` /
  `vitest.config.ts` / `packages/examples/tsconfig.json` / `.gitignore` /
  `.vscode/settings.json`, mion keeps the repo `README.md`, CLAUDE.md becomes
  the ts-run-types rules plus a temporary mion addendum; regenerate
  `pnpm-lock.yaml`. `.gitmodules` + the tsgolint submodule carry over untouched.
- Keep the merge commit minimal and verifiable: mion packages STILL consume
  `@ts-runtypes/*@0.12.2` from npm in this commit; no workspace rewiring yet.
  Green bar = pnpm install, Go build + tests, both vitest suites, both lint
  flows still passing.
- Land via direct push or one-off merge-commit PR (decision 5). Tag the
  pre-merge heads of both repos first (e.g. `pre-merge-mion`,
  `pre-merge-ts-run-types`) so the join is easy to find forever.

### Step 3 — Workspace and toolchain unification ✅ DONE

Shipped 2026-08-24 — record in
[unify-workspace-and-toolchain.md](unify-workspace-and-toolchain.md). Everything
below landed, plus: the step-2 vite 8 hazard was root-caused (rolldown drops the `"use strict"`
prologue rollup emitted for iife output, so the script-evaluated edge bundles ran sloppy) and
fixed, so the whole repo is on vite 8; four undeclared `@ts-runtypes` dependencies that only
resolved through hoisting were declared; `@mionjs/devtools` stopped inlining a second copy of the
resolver into its published output; and a real client bug (`fetchOptions.headers` dropped unless
it was a plain object) was found by the widened lint scope and fixed.

- One root `package.json` (ts-run-types base): devDependency union, engines
  node ≥ 26, `rtx` scripts + mion's `test:ci` batching (OOM guard) preserved.
- Adopt ts-run-types' `pnpm-workspace.yaml` policies wholesale; carry over only
  the mion-specific needs (e.g. `allowBuilds` entries mion actually requires,
  `@ts-runtypes/*` dropped from `minimumReleaseAgeExclude` once workspace-linked).
- Switch every `@mionjs/*` dependency on `@ts-runtypes/*` from `0.12.2` to
  `workspace:*`; delete lerna + nx (`lerna.json`, `nx.json`,
  `packages/client/project.json`, the lerna-driven root scripts) and rewire
  `lint`/`build`/`clean` to `rtx` / plain pnpm recursion.
- Unify format/lint: oxfmt + prettier-for-markdown scope extended over the mion
  packages (settings already identical, so churn is a one-time small diff);
  mion's eslint flat config (its own plugin rules + the runtypes rules) kept and
  wired into the root `lint` alongside oxlint. Decide file-by-file nothing —
  this step's spec pins the exact tool-per-tree matrix.
- Root vitest config: union of the 5 ts-run-types projects + 10 mion projects;
  `pretest` (Go binary + dists) covers everything. Rename `packages/drizze` →
  `packages/drizzle` while we're touching every config that names it.
- Green bar: full `pnpm test` + `go test` + `rtx core smoke` from one clean
  clone bootstrapped by the ts-runtypes-setup skill.

### Step 4 — Website merge (one Nuxt install, two sites) ✅ DONE

Shipped 2026-08-24 — record in
[merge-websites-one-nuxt-two-sites.md](merge-websites-one-nuxt-two-sites.md).
It landed BEFORE step 3, which turned out not to be a prerequisite. No new dependency was
needed (the one mion-only package was already obsolete) so the image was untouched, and the
benchmark chart data was already committed in the container. Three latent bugs were fixed on
the way: a broken twoslash caret on the mion home page, a documented `initRouter` API that does
not exist, and the pull-request code-import gate never checking the runtypes content tree.
The mion.pages.dev Cloudflare project is still an OPEN OWNER ACTION.

### Step 5 — e2e unification on verdaccio ✅ DONE

Shipped 2026-08-24 — record in
[unify-e2e-on-verdaccio.md](unify-e2e-on-verdaccio.md).
One verdaccio now serves both scopes, `pack.mjs` packs all 21 tarballs, and the mion side
rides two consumer lanes rather than the planned `apps/` member: the mion flow is
vitest + a live server + a `vite build`, which `build-all.mjs` cannot host, and it needs
vite 8 / TypeScript 6 against a matrix toolchain pinned to rolldown-vite / TypeScript 5.
A bun lane was added too — `@mionjs/platform-bun` had no end-to-end coverage at all.
`test-publish/` and the three pack scripts are gone.

⚠️ `tarballs/` is also what the release publishes from, and `@mionjs/*` is not on the
release train yet, so `publish-tarballs.mjs` and `manual-publish.mjs` filter to
`ts-runtypes-*`. **Step 6 removes both filters** when it unifies the versions.

### Step 6 — One release train + CI unification ✅ DONE

Shipped in pieces between 2026-08-24 and 2026-09-02 — record in
[merge-6-unify-release-train-and-ci.md](merge-6-unify-release-train-and-ci.md). Decision 1
was reversed on the way: the packages did NOT keep the `@ts-runtypes/*` names, every one of
them is `@mionjs/*` now ([rename-ts-runtypes-namespace-to-mion.md](rename-ts-runtypes-namespace-to-mion.md)),
which is what put the framework packages on `version.json` (they merged onto it with the
devtools packages). The last piece derived the publish order from the workspace, since the
hand-kept ranks would have put `@mionjs/core` live before `@mionjs/run-types`. The first
release itself (the `prod` branch, the bump, the tags) is
[../todos/first-unified-release.md](../todos/first-unified-release.md).

- ts-run-types CI becomes the repo CI: `ci.yml` gains the mion vitest batches +
  bun tests + mion eslint; `release-gate.yml` gains the mion e2e app; mion's
  `pull-requests.yml` retired.
- Release: `version.json` lockstep covers all packages (decision 2);
  `publish-tarballs.mjs` / `publish.mjs` / `stage-approve.mjs` /
  `verify-live.mjs` / `unpublish.mjs` extended with the `@mionjs/*` set in
  dependency-safe order; mion's `scripts/publish.sh` / `unpublish.sh` deleted.
- Create the `prod` branch; enable the branch protections the flow assumes
  (merge-commit-only promotion, commitlint on PRs). First unified release ships
  every package at the new version.
- git-cliff changelog + commitlint now cover the whole repo (mion history predates
  conventional commits; the config's tag pattern and skip rules make that fine).

### Step 7 — Guidelines, skills, docs, metadata sweep ✅ DONE

Shipped 2026-09-02 — record in
[merge-7-guidelines-skills-docs-metadata-sweep.md](merge-7-guidelines-skills-docs-metadata-sweep.md).
CLAUDE.md, SETUP.md and the root README had already been merged; the repo-reference sweep
landed last, pinned by a contract test. Archiving the old repositories stays an owner action
(listed in the first-release todo).

- Docs: CLAUDE.md is already merged; docs/ARCHITECTURE.md and docs/ROADMAP.md
  deliberately deleted (2026-08-24/25); remaining: SETUP.md gains the mion side.
- Repo-reference sweep `MionKit/ts-run-types` → `MionKit/mion`: package.json
  repository fields (+ `directory`), package READMEs, both Containerfile source
  labels, website `app.config.ts` github block + content pages,
  `build-binaries.mjs`, `setup-claude-web.sh`, `.claude` hooks/skills,
  `repo-contracts.test.ts` (update the pinned contract, don't delete it).
- Skills: the 8 `.claude/skills` carry over; `ts-runtypes-setup` + the
  session-start hook extended to cover the mion packages (they only need pnpm on
  top of the existing bootstrap).
- docs merge hygiene: mion's 63 `docs/done` specs + runtypes' specs coexist;
  `docs/maybe/` keeps its parked specs (and, since 2026-08-30, the surviving `plans/` idea).
- Archive `MionKit/ts-run-types` on GitHub with a README pointing at mion.

### Step 8 — Fold mion-benchmarks into a container ✅ DONE

Shipped 2026-08-25 — record in
[merge-8-fold-mion-benchmarks-into-container.md](merge-8-fold-mion-benchmarks-into-container.md).
The release gate was lifted (decision 7), so this landed before steps 6 and 7.

It went to a THIRD image rather than into `container/benchmarks/`: eight competitor web
frameworks and a load generator must not be able to disturb the validation lanes, and the
uws lane needs a newer glibc than the website image's base provides. The import came from
the benchmarks repo's `mion-runtypes-` branch (the 2026 harness), not `master` (a 2024
tree). The mion site's pages now render from data generated on every deploy, with the
committed chart JSON and the hand-written result tables deleted. Archiving
`MionKit/Benchmarks` is an OPEN OWNER ACTION.

All eight steps have landed. What remains is the first release cut from the joined repo
and the owner-only actions, tracked in
[../todos/first-unified-release.md](../todos/first-unified-release.md).
