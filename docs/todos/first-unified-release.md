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
yet: there is no `prod` branch, npm still serves the framework packages at 0.8.10 and
the type-system packages under their old scope, and the `v0.12.2` tag the changelog
starts from does not exist in this repo.

## Plan

Follow the [release-to-prod skill](../../.claude/skills/release-to-prod/SKILL.md) end to
end. The points specific to this FIRST cut:

1. **Bump to 0.13.0** (`pnpm rtx release bump minor`). The framework packages jump from
   0.8.10 straight to it; the drizzle packages stay at their own line and republish only
   if their sources changed (`check-drizzle-versions.mjs` says which).
2. **Changelog.** git-cliff starts at the newest `v*` tag. This repo carries mion's old
   `v0.8.x` tags and the `pre-merge-mion` tag, but NOT the type-system packages' `v0.12.2`
   (their tags never came across at the history join), so a run today would span the
   whole joined history back to v0.8.9. Before curating: tag the pre-merge type-system
   head as `v0.12.2` and `pre-merge-ts-run-types` (owner action below); after that the
   generated section covers exactly the post-merge work.
3. **Dry pass before the cut.** `pnpm rtx release preflight`, `pnpm rtx release pack`,
   `pnpm rtx release e2e`, then `pnpm rtx release tarballs --plan`: every lockstep tarball
   at 0.13.0 and each drizzle one either staged at its tree version or skipped as
   verified-identical. The plan prints the derived leaves-first order
   (`scripts/lib/publish-order.mjs`): payloads, then `@mionjs/bin` and `@mionjs/uws`,
   then `@mionjs/run-types`, then each package after everything it depends on.
4. **Create `prod` from `main`** at the release commit, open the `release/v0.13.0` merge
   PR into it. `pre-publish.yml` (`version-fresh`, `main-ancestor`, `merge-shape`) then
   `publish.yml` stage every package; `pnpm rtx release stage-approve` promotes them in
   that same order with one 2FA prompt.
5. **After approval:** `post-publish.yml` installs the LIVE packages, matrix AND the mion
   consumer lanes (the npm backend runs them now); `verify-live` must pass for the
   website deploy.

## Owner actions (nobody else can do these)

- Push the two missing tags. The join commit is the first merge on `main` with two
  unrelated parents; its second parent is the frozen type-system head:
  ```bash
  join=$(git log --merges --format=%H --first-parent main | tail -1)
  git tag pre-merge-ts-run-types "${join}^2" && git tag v0.12.2 "${join}^2"
  git push origin pre-merge-ts-run-types v0.12.2
  ```
- Create the `prod` branch and its protections: merge-commit-only promotion, the
  `pre-publish.yml` checks required (`version-fresh`, `main-ancestor`), rebase-merge on
  `main`.
- Make sure the `NPM_TOKEN` automation token covers EVERY `@mionjs/*` package, the seven
  `@mionjs/binary-*` and seven `@mionjs/uws-*` payloads included. A brand-new name cannot
  be staged; if any of them has never been published, `pnpm rtx release manual-publish`
  creates it live first (it publishes everything not already live, leaves first).
- The Cloudflare Pages project for mion.pages.dev, so `website-deploy.yml` can deploy both
  sites.
- Archive `MionKit/ts-run-types` (README pointer: development moved to `MionKit/mion`,
  history preserved there under the `pre-merge-ts-run-types` tag) and `MionKit/Benchmarks`
  (its harness lives in `container/mion-bench/`).

## Tests

No new code in this todo; the release scripts are covered by
`packages/devtools/test/publish-order.test.ts` and `release-receipt.test.ts`, and the gate
workflows run on the release PR.

## Docs

Once the release is live, update the version references on both sites' install pages if
they pin one, and CHANGELOG.md as the skill describes.

## Out of scope

Renaming or deprecating the old `@ts-runtypes/*` npm packages: they stay live at 0.12.2
as the last standalone release.

## Done when

- `v0.13.0` is live on npm for every lockstep package, the drizzle packages at their tree
  versions, `post-publish.yml` green including the mion consumer lanes.
- `prod` exists with its protections and `website-deploy.yml` deployed both sites.
- The two old repositories are archived.
