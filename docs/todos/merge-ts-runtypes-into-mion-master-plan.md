# Merge the ts-run-types repo into the mion monorepo (master plan)

**Status:** open
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
6. **`plans/` stays untouched.** It is an ideas folder, not a todo backlog;
   CLAUDE.md gets a line saying so, so nobody keeps flagging it as stale.
7. **mion benchmarks move into `container/benchmarks/`** (from the sibling
   `mion-benchmarks` repo) — deliberately LAST, only after everything else works
   and the first unified release is published. This is step 8.

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
[../done/premerge-cleanup-of-mion.md](../done/premerge-cleanup-of-mion.md). It went
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
[../done/join-ts-runtypes-history.md](../done/join-ts-runtypes-history.md). The join landed
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

### Step 3 — Workspace and toolchain unification

Spec: [unify-workspace-and-toolchain.md](unify-workspace-and-toolchain.md)

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

### Step 4 — Website merge (one Nuxt install, two sites)

Spec: [merge-websites-one-nuxt-two-sites.md](merge-websites-one-nuxt-two-sites.md)

- Fold mion's `website/` into `container/website/` (the containerized install is
  the base: playground, bench tables, twoslash server, agent-heartbeat). The one
  codebase builds TWO separate static sites (decision 3): a site selector (e.g.
  an `RT_SITE=mion|runtypes` env var read by `nuxt.config.ts` / the build
  scripts) picks the content tree, app.config (nav, socials, github block,
  branding) and public assets per site; components, server utils, layouts and
  the code-import pipeline are shared.
- The two content trees stay separate (no nav merging): the runtypes docs as
  they are today, and mion's content dirs (`introduction`, `server`,
  `drizzle-orm`, `client`, `run-types`, `devtools`, `platforms`, `benchmarks`,
  `articles`) as the mion site. Reconcile mion's `run-types` section so it
  introduces the topic and links across to the runtypes site rather than
  duplicating its guide.
- Merge mion's app components/utils into the container app; dependency lists are
  near-identical (same Nuxt/Docus/content/ui/shiki versions), so the image's
  `_deps` grows by the mion-only extras. Rebuild + push `tsrt-website`.
- The merged `packages/examples` feeds code-import for both sites; port mion's
  `check-links` / `check-unused-examples` into the container scripts if they
  differ.
- Delete `website/` (including its stale docus-starter README/name; the
  `.vscode-extension` was already deleted in step 1), delete `pages-build` /
  `copy-benchmarks` root scripts (step 8 re-homes the benchmark data), retire
  `nuxtjs.yml`.
- Deploy: `website-deploy.yml` builds and deploys BOTH sites to Cloudflare Pages
  (runtypes.pages.dev stays; mion.pages.dev is a new Pages project the owner
  creates); mion's GitHub Pages deploy is retired.

### Step 5 — e2e unification on verdaccio

Spec: [unify-e2e-on-verdaccio.md](unify-e2e-on-verdaccio.md)

- Extend `container/pre-publish-e2e/`: verdaccio config serves `@mionjs/*` (like
  `@ts-runtypes/*`) only from local publishes, never proxied; `e2e-serve.sh`
  publishes the mion tarballs after the runtypes ones in dependency order.
- Port `test-publish/`'s four specs (json flow, binary, packaged-sources,
  build-output/inlining) into a mion consumer app under `apps/` driven by
  `build-all.mjs`, installing from verdaccio exactly like the other apps.
- Extend `scripts/release/pack.mjs` + `e2e.mjs` (+ receipt) to include the 11
  public `@mionjs/*` packages. Rebuild + push `tsrt-e2e`.
- Delete `test-publish/`, `scripts/pack-packages.sh`, `scripts/pack-and-install.sh`,
  `scripts/pre-publish-test.sh`.

### Step 6 — One release train + CI unification

Spec: [unify-release-train-and-ci.md](unify-release-train-and-ci.md)

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

### Step 7 — Guidelines, skills, docs, metadata sweep

Spec: [guidelines-skills-docs-metadata-sweep.md](guidelines-skills-docs-metadata-sweep.md)

- Final CLAUDE.md: ts-run-types rules as the spine + a mion-specifics section
  (devtools committed-build requirement, test:ci batching, SFC/bun loaders,
  platform adapters); SETUP.md + ARCHITECTURE.md gain the mion side; ROADMAP
  reflects the standalone-library idea being dropped.
- Repo-reference sweep `MionKit/ts-run-types` → `MionKit/mion`: package.json
  repository fields (+ `directory`), package READMEs, both Containerfile source
  labels, website `app.config.ts` github block + content pages,
  `build-binaries.mjs`, `setup-claude-web.sh`, `.claude` hooks/skills,
  `repo-contracts.test.ts` (update the pinned contract, don't delete it).
- Skills: the 8 `.claude/skills` carry over; `ts-runtypes-setup` + the
  session-start hook extended to cover the mion packages (they only need pnpm on
  top of the existing bootstrap).
- docs merge hygiene: mion's 63 `docs/done` specs + runtypes' specs coexist;
  `docs/maybe/` keeps its parked specs; `plans/` stays as the ideas folder.
- Archive `MionKit/ts-run-types` on GitHub with a README pointing at mion.

### Step 8 — Fold mion-benchmarks into the container (last)

Spec: [fold-mion-benchmarks-into-container.md](fold-mion-benchmarks-into-container.md)

Only after everything above works and the first unified release is published:

- Move the sibling `mion-benchmarks` repo into `container/benchmarks/` alongside
  the validation benchmarks, following the same isolation pattern (each heavy
  dependency set as its own pnpm project under `_deps/`, baked into the
  `tsrt-website` image, results generated at website-build time).
- Wire the mion site's benchmarks pages to the generated data, replacing the old
  `copy-benchmarks`-from-sibling-repo flow for good; archive `mion-benchmarks`.
- This master plan moves to `docs/done/` when this step lands.
