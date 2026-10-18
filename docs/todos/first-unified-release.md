---
type: chore
spec: full-plan
status: ready
created: 2026-09-02
---

# Cut the first unified `@mionjs/*` release

## Problem

Every package in the repo now rides one release train: the `version.json` lockstep
(0.12.2 today, the last version the type-system packages shipped from their former
repo) plus the drizzle dialect packages on their own drizzle-aligned line. The scripts,
workflows and docs are all in place, but no release has been cut from the joined repo
yet: `prod` exists but nothing was ever published from it (its first `publish.yml` run
failed within seconds and the branch still sits far behind `main`), npm still serves the
framework packages at 0.8.10 and the type-system packages under their old scope, and the
`v0.12.2` tag the changelog starts from does not exist in this repo.

## Plan

Follow the [release-to-prod skill](../../.agents/skills/release-to-prod/SKILL.md) end to
end. The points specific to this FIRST cut:

1. **Bump to 0.13.0** (`pnpm miondevx release bump minor`). The framework packages jump from
   0.8.10 straight to it; the drizzle packages stay at their own line and republish only
   if their sources changed (`check-drizzle-versions.mjs` says which).
2. **Changelog.** This repo carries mion's old `v0.2.0`…`v0.8.10` tags only: no
   `pre-merge-mion`, and not the type-system packages' `v0.12.2` (their tags never came
   across at the history join). bump.md's `merge-base main prod` range does not fit this
   cut either: `prod` sits 515 unpublished commits past the join. So the generated section
   uses the join itself: `git-cliff 5ad1ba115..HEAD`, exactly the post-merge work, no tag
   needed. A hand-written paragraph on top recaps what the mion framework packages gained
   since 0.8.10 (about 1,700 commits between that tag and the join were never released).
3. **Dry pass before the cut.** `pnpm miondevx release preflight`, `pnpm miondevx release pack`,
   `pnpm miondevx release e2e`, then `pnpm miondevx release tarballs --plan`: every lockstep tarball
   at 0.13.0 and each drizzle one either staged at its tree version or skipped as
   verified-identical. The plan prints the derived leaves-first order
   (`scripts/lib/publish-order.mjs`): payloads, then `@mionjs/bin-compiler` and `@mionjs/bin-uws`,
   then `@mionjs/run-types`, then each package after everything it depends on.
4. **Publish 0.13.0 by hand, prove CI with 0.13.1.** `manual-publish` publishes every package
   not live at the tree version, not just the 19 new names, so after it 0.13.0 is fully live
   and publish.yml would refuse it. The owner runs it once on the 0.13.0 bump commit; the
   first CI-staged release is then a 0.13.1 patch bump.
5. **Rehearse the site deploy.** `website-deploy.yml` never got past its `verify-live` guard
   in CI, so the image pulls, site build, site check and Cloudflare secrets were unproven.
   It gains a `dry_run` input that runs all of it and tests the credentials read-only.
   Dispatch it from `main` before the manual publish; the first real deploy follows from
   `main` once 0.13.0 is live.
6. **Open the `release/v0.13.1` merge PR into `prod`.** Never push `prod` directly: a
   plain push is what failed both earlier `publish.yml` runs at `merge-shape`. `prod` is
   already an ancestor of `main`, so the merge commit lands clean.
   `pre-publish.yml` (`version-fresh`, `main-ancestor`, `merge-shape`) then
   `publish.yml` stage every package; `pnpm miondevx release stage-approve` promotes them in
   that same order with one 2FA prompt.
7. **After approval:** `post-publish.yml` installs the LIVE packages, matrix AND the mion
   consumer lanes (the npm backend runs them now); `verify-live` must pass for the
   website deploy.

## Owner actions (nobody else can do these)

- Push the two missing tags. The join commit is the merge whose two parents share no
  history (`5ad1ba115`, inside PR #149, not on main's first-parent line); its second parent
  is the frozen type-system head (`6b89eb4ac`):
  ```bash
  join=$(git rev-list --merges main | while read c; do
    git merge-base "$c^1" "$c^2" >/dev/null || { echo "$c"; break; }; done)
  git tag pre-merge-ts-run-types "${join}^2" && git tag v0.12.2 "${join}^2"
  git push origin pre-merge-ts-run-types v0.12.2
  ```
- Set the `prod` branch protections (the branch itself exists): merge-commit-only
  promotion, the gate jobs and `version-fresh` required, rebase-merge on `main`.
  `main-ancestor` stays out of the required set (release skill: a forced-tree
  reunification keeps it red forever).
- `pnpm miondevx release manual-publish` on the 0.13.0 bump commit (step 4), `gh` logged
  in locally so `stage-approve` can dispatch the site deploy.
- Replace the `NPM_TOKEN` secret: the current one answers `401 Unauthorized` (checked
  2026-10-14; replaced since). The new granular token must cover EVERY `@mionjs/*` package,
  the seven `@mionjs/native-compiler-*` and five `@mionjs/native-uws-*` payloads included.
  A brand-new name cannot be staged, and 19 have never been published (`bin-compiler`,
  `bin-uws`, `platform-uws`, the four drizzle packages, every `native-*` payload): the
  manual publish of 0.13.0 creates them.
- Archive `MionKit/ts-run-types` (README pointer: development moved to `MionKit/mion`,
  history preserved there under the `pre-merge-ts-run-types` tag) and `MionKit/Benchmarks`
  (its harness lives in `container/mion-bench/`).

## Tests

The deploy dry run is pinned by `packages/devtools/test/website-deploy-contracts.test.ts`.
The release scripts are covered by `packages/devtools/test/publish-order.test.ts` and
`release-receipt.test.ts`, and the gate workflows run on the release PR.

## Docs

Once the release is live, update the version references on both sites' install pages if
they pin one, and CHANGELOG.md as the skill describes.

## Out of scope

Renaming or deprecating the old `@ts-runtypes/*` npm packages: they stay live at 0.12.2
as the last standalone release.

## Done when

- `v0.13.0` is live on npm for every lockstep package, the drizzle packages at their tree
  versions (by hand); `v0.13.1` staged by CI and approved, `post-publish.yml` green
  including the mion consumer lanes.
- A `website-deploy.yml` dry run green before the publish; `prod` protected;
  `website-deploy.yml` deployed mion.pages.dev.
- The two old repositories are archived.
