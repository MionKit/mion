---
type: chore
spec: full-plan
status: ready
created: 2026-11-14
---

# Attach each release's benchmark data to its GitHub Release

## Problem

The published benchmark numbers (`bench-data/`, the JSON the site's bench pages fetch) exist only in two
places that do not last:

- the `website-output-deploy` artifact every `website-deploy.yml` run uploads
  (`.github/workflows/website-deploy.yml:156-161`, no `retention-days`, so the repo's artifact retention
  applies, 90 days by default);
- Cloudflare Pages' past deployments.

They are not in git (`container/website/.gitignore:57` ignores `/public/bench-data/`). A rebuild from a tag
cannot bring them back: they depend on the runner and the day. So after the retention window, a release's
numbers are gone and there is no way to compare versions over time.

A second, related gap: the release flow now rehearses the deploy before the prod merge
(`website-deploy.yml` with `dry_run=true`, full benchmarks on the exact release tree), but the post-publish
deploy that `pnpm miondevx release stage-approve` dispatches (`scripts/release/stage-approve.mjs:196-203`)
always re-runs the benchmarks (about an hour). `SETUP.md:513` even says to leave `reuse_benchmarks` off after
a release. Reusing the dry run is safe when it measured the same tree, and the attached asset must then be
those numbers.

## Plan

### 1. Upload `bench-data/` to the release (website-deploy.yml)

New step after "Deploy the site to Cloudflare Pages" (`website-deploy.yml:171-176`), before the engine
check, so a report-only engine failure never skips it:

- Runs only when `!inputs.dry_run` (a dry run has no release yet; the tag does not exist).
- Version = `jq -r .version version.json` of the checked-out tree (never `inputs.version`, which is log-only).
- Tag = `v$VERSION`. `gh release view "v$VERSION"` must succeed; a missing release is an error
  (`::error::`), not a silent skip: `verify-live` already proved the version is live, so publish.yml made it.
- Asset name `bench-data-$VERSION.tar.gz`, built from the deployed output:
  `tar czf "$RUNNER_TEMP/bench-data-$VERSION.tar.gz" -C container/website/.output/public bench-data`.
- First upload wins: asset already on the release → `::notice::` and skip, never `--clobber`. Not a race guard
  (deploys already run one at a time via the workflow concurrency group): it keeps the release-day numbers.
  The first real deploy of a version is the release-day measurement; a later docs-only redeploy on the same
  version (from `main`, with or without `reuse_benchmarks`) must not replace it.
- Job permissions (`website-deploy.yml:51-55`): add `contents: write` (release upload). Comment why.
  `GH_TOKEN: ${{ github.token }}` on the step.

### 2. Release deploy reuses the dry run's benchmarks

- `website-deploy.yml` reuse step (`:91-104`): today it takes the newest unexpired `website-output-deploy`
  artifact, any run. Add a tree check: read the source run's `head_sha`, `git fetch` it, and fail unless
  `git rev-parse "$sha^{tree}"` equals `git rev-parse HEAD^{tree}`. Only when deploying from `prod`:
  a docs-only deploy from `main` reuses older numbers on purpose. The prod merge commit has a different SHA
  from the main commit the dry run ran on, but the same tree, so compare trees, not SHAs.
  Needs `fetch-depth` / an explicit fetch of that SHA; checkout is shallow by default.
- `scripts/release/stage-approve.mjs`: new `--reuse-benchmarks` flag, forwarded as
  `-f reuse_benchmarks=true` in `dispatchWebsiteDeploy` (`:196-203`). Also honored by `--deploy-only`.
  Document it in the usage header (`:22-30`).
- Docs: `SETUP.md:513` (drop "Leave it off after a release", say a release deploy may reuse a green dry run of
  the same tree, and the tree check enforces it), `SETUP.md:527`, and
  `.agents/skills/release-to-prod/promote.md` Phase 3 step 1: after a green website dry run in Phase 2, run
  `stage-approve --reuse-benchmarks`. Update the workflow header comment (`website-deploy.yml:7-8`) the same
  way.

## Tests

- `stage-approve.mjs`: if the release scripts have unit tests (check `scripts/**/test` / `*.test.mjs`), add
  one pinning that `--reuse-benchmarks` adds `-f reuse_benchmarks=true` to the dispatch args and that the
  default does not. Otherwise factor the arg building into a pure function and test that.
- Workflow steps: no CI harness runs workflows. Validate with `actionlint` if the repo uses it, and run the
  step's shell locally against a fake `.output/public/bench-data` (tar name, contents, skip-if-present logic
  with a stubbed `gh`).
- Live check after merge: the next real deploy attaches `bench-data-X.Y.Z.tar.gz` to the release; a second
  deploy of the same version logs the skip notice.

## Docs

`SETUP.md` website-deploy section (existing paragraphs at `:513` and `:527`), `promote.md` Phase 3, the
workflow header comment. No website page: this is maintainer tooling.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- Backfilling past releases. Optional one-off by hand: download each still-unexpired deploy run's
  `website-output-deploy` artifact and `gh release upload` its `bench-data/` to the matching tag.
- Storing full site builds (Cloudflare keeps every deploy; a tag rebuilds the rest).
- A history/comparison page on the website.

## Done when

- A real `website-deploy.yml` run attaches `bench-data-<version>.tar.gz` to `v<version>` once, and never
  replaces an existing one; a dry run attaches nothing.
- A prod deploy with `reuse_benchmarks=true` fails unless the reused artifact was built from the same tree.
- `stage-approve --reuse-benchmarks` dispatches the deploy with `reuse_benchmarks=true`, with a test.
- SETUP.md, promote.md and the workflow header describe the new flow; no line still says to leave reuse off
  after a release.
- `pnpm run lint` and `pnpm run format` clean.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
