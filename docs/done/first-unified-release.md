---
type: chore
spec: full-plan
status: done
created: 2026-09-02
---

# Prepare the first unified `@mionjs/*` release

## Problem

Every package in the repo rides one release train: the `version.json` lockstep (0.12.2,
the last version the type-system packages shipped from their former repo) plus the drizzle
dialect packages on their own drizzle-aligned line. No release had been cut from the joined
repo: `prod` existed but nothing was ever published from it (both `publish.yml` runs failed
at `merge-shape` after a plain push), npm served the framework packages at 0.8.10 and the
type-system packages under their old scope.

## What landed

1. **Bump to 0.13.0** (`pnpm miondevx release bump 0.13.0`, minor: the post-join commits carry
   breaking changes). Every lockstep package jumps from 0.8.10 / 0.12.2 to 0.13.0. The four
   drizzle packages go to 0.45.1: their `@mionjs/run-types` peer range moved to
   `>=0.13.0 <0.14.0`, which the bump counts as a published change.
2. **Changelog.** The repo carries only mion's old `v0.2.0`…`v0.8.10` tags: no
   `pre-merge-mion`, no `v0.12.2`. bump.md's `merge-base main prod` range did not fit either:
   `prod` sat 515 unpublished commits past the join. The section was generated from the join
   itself, `git-cliff 5ad1ba115..HEAD` (the merge whose two parents share no history, inside
   PR #149), then curated: opening prose, a recap of the mion work since 0.8.10 (about 1,700
   commits between that tag and the join never shipped), grouped breaking changes, features,
   performance and fixes. Docs, test and chore commits were dropped as internal noise.
3. **The bump keeps each `package.json`'s indent.** `bump-version.mjs` rewrote every manifest
   with two spaces, so four-space files came back whole-file diffs (889 lines for a 30-line
   bump). `scripts/lib/json-file.mjs` writes in the indent the file already uses.
4. **Website deploy dry run.** `website-deploy.yml` had never got past its `verify-live` guard
   in CI, so the image pulls, site build, site check and Cloudflare secrets were unproven. A
   `dry_run` input skips the guard and the upload, runs everything else, and replaces the
   upload with a read-only `wrangler pages deployment list`. It queues in its own concurrency
   group, so it never cancels a real deploy waiting its turn.
5. **Release docs.** SETUP.md and `pre-publish.yml` told owners to require `main-ancestor` on
   prod, against the release skill's warning; both now leave it out. SETUP.md's bootstrap note
   says `manual-publish` ships the whole version, and documents the dry run; the release skill
   rehearses it before merging a release PR.
6. **Client test timeout.** The first fetched call imports the metadata lane, whose run-types
   sources the plugin compiles on the spot (about 1.5s each, ~5s in all on a slow host), so
   the first client spec timed out at vitest's 5s default. The client project allows 30s.

## Dry pass

On the bump commit: `release preflight` (Go tests, lint, format, 14,507 JS tests),
`release binaries`, `release pack`, `release e2e` (container backend: all 30 tarballs
published to a throwaway verdaccio, then the bundler matrix, the mion node and bun consumer
lanes and the host smoke installed from it; receipt `0.13.0 ... 30 tarballs`), and
`release tarballs --plan`: 30 tarballs leaves-first, the twelve native payloads and
`@mionjs/run-types` first, the drizzle packages at 0.45.1.

## Decided along the way

- **0.13.0 by hand, 0.13.1 by CI.** npm cannot stage a brand-new name and 19 were never
  published. `manual-publish` publishes every package not live at the tree version, not only
  the new names, so after it 0.13.0 is fully live and `publish.yml` would refuse it. The owner
  publishes 0.13.0 once; the first CI-staged release is a 0.13.1 patch bump.
- **The spec's join command was wrong.** `git log --merges --first-parent main | tail -1`
  returns a 2018 apids merge. The join is the merge whose parents share no history.
- **Required checks on prod wait for a real run.** Their names only appear in the ruleset
  picker after the checks have run once against `prod`.

## Out of scope

Renaming or deprecating the old `@ts-runtypes/*` npm packages: they stay live at 0.12.2 as
the last standalone release.
