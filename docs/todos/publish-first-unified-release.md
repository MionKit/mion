---
type: chore
spec: full-plan
status: ready
created: 2026-10-18
---

# Publish 0.13.0 by hand, then prove the CI release with 0.13.1

## Problem

`main` carries the 0.13.0 lockstep bump (drizzle packages at 0.45.1) with its curated
CHANGELOG section, and the release dry pass (preflight, binaries, pack, verdaccio e2e,
`tarballs --plan`) is green on it. Nothing is live yet: npm serves the framework packages at
0.8.10 and the type-system packages as `@ts-runtypes/*@0.12.2`. `prod` sits at a September
commit of `main` and has never published.

npm cannot stage a brand-new name, and 19 have never been published (`bin-compiler`,
`bin-uws`, `platform-uws`, the four drizzle packages, the seven `native-compiler-*` and five
`native-uws-*` payloads). `pnpm miondevx release manual-publish` publishes every package not
live at the tree version, not only the new names, so once it runs, 0.13.0 is fully live and
`publish.yml` would refuse it (`version-fresh`). So 0.13.0 ships by hand and the first
CI-staged release is 0.13.1.

## Plan

Follow the [release-to-prod skill](../../.agents/skills/release-to-prod/SKILL.md), with these
first-release specifics:

1. **Rehearse the site deploy** from `main`:
   `gh workflow run website-deploy.yml --ref main -f dry_run=true`. Green proves the image
   pulls, site build, site check and the Cloudflare credentials. Red → fix on `main` first.
2. **Owner: publish 0.13.0 by hand** on the bump commit: `pnpm miondevx release manual-publish`
   (one `npm login`, one 2FA challenge, leaves-first, resumable).
3. **Owner: tag the bump commit `v0.13.0`** and push it (CI only tags prod merges, so nothing
   else will). Without it the 0.13.1 changelog range would repeat all of 0.13.0.
4. **First real site deploy from `main`**: `gh workflow run website-deploy.yml --ref main`.
   `verify-live` passes because `main`'s tree is the live 0.13.0. Not `stage-approve`: its
   dispatch targets `prod`, whose tree still says 0.12.2.
5. **0.13.1 bump PR into `main`**: `pnpm miondevx release bump 0.13.1`, changelog from
   `git-cliff v0.13.0..HEAD` (not bump.md's merge-base, which starts at prod's old tip).
6. **Release PR `release/v0.13.1` → `prod`**, merge commit only. `pre-publish.yml` then
   `publish.yml` stage every package. The owner runs `pnpm miondevx release stage-approve`
   with `gh` logged in, so it dispatches the site deploy from `prod` once npm serves 0.13.1.
7. **After approval:** `post-publish.yml` installs the LIVE packages (matrix and mion consumer
   lanes) and must be green; `website-deploy.yml` must deploy mion.pages.dev.
8. Update the `mion --version` sample on
   `container/website/content/02.runtypes/01.introduction/02.built-on-typescript-go.md`
   (it shows `mion 0.12.2`).

## Owner actions (nobody else can do these)

- Steps 2, 3 and the `stage-approve` in step 6.
- Push the two missing history tags. The join commit is the merge whose two parents share no
  history (`5ad1ba115`, inside PR #149); its second parent is the frozen type-system head
  (`6b89eb4ac`). Needs a full clone:
  ```bash
  join=$(git rev-list --merges main | while read c; do
    git merge-base "$c^1" "$c^2" >/dev/null || { echo "$c"; break; }; done)
  git tag pre-merge-ts-run-types "${join}^2" && git tag v0.12.2 "${join}^2"
  git push origin pre-merge-ts-run-types v0.12.2
  ```
- Required status checks on the `prod` ruleset (merge-commit-only is already set). Add them
  after the 0.13.1 release PR's checks have run once, so the picker shows their real names:
  `version.json not already on npm` and the `gate / …` jobs. Leave `main-ancestor` out (a
  forced-tree reunification keeps it red forever).
- Archive `MionKit/ts-run-types` (README pointer: development moved to `MionKit/mion`,
  history preserved there under the `pre-merge-ts-run-types` tag) and `MionKit/Benchmarks`
  (its harness lives in `container/mion-bench/`).

## Tests

No new code. The release scripts are covered by `packages/devtools/test/publish-order.test.ts`
and `release-receipt.test.ts`, the dry run by `website-deploy-contracts.test.ts`; the gate
workflows run on the release PR, `post-publish.yml` on the live packages.

## Out of scope

Renaming or deprecating the old `@ts-runtypes/*` npm packages: they stay live at 0.12.2 as
the last standalone release.

## Done when

- 0.13.0 live on npm for every lockstep package and the drizzle packages at 0.45.1, tagged
  `v0.13.0`.
- 0.13.1 staged by CI and approved, `post-publish.yml` green including the mion consumer lanes.
- A green dry run, then mion.pages.dev deployed by `website-deploy.yml`.
- `prod` requires its status checks; both old repositories are archived.
