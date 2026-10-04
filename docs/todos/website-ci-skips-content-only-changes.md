---
type: chore
spec: full-plan
status: ready
created: 2026-10-04
---

# Skip the website build and smoke on content-only or CSS-only changes

## Problem

Most website edits are page text or styling. Today any change under `container/website/`
re-runs the site checks on a pull request:

- `ci.yml` job `smoke`, item `website` (`pnpm miondevx website check`), every PR.
- `pr-heavy.yml` job `website` (`pnpm miondevx website container-build`), PRs labelled `website`.

Both are gated by `scripts/ci/lanes.mjs`: a lane hashes the files it reads and skips when that
hash already passed (or equals the PR base). The two lanes list the whole `container/website/`
dir as input, so a typo fix in a page moves the hash and pays a ~10 minute build.

Wanted: a commit that changes only `container/website/content/**` or `*.css` files under
`container/website/` counts as "nothing the site code reads changed", so both lanes skip, even
when the `website` label is on. Any other website file (components, plugins, pages, composables,
`nuxt.config.ts`, `content.config.ts`, `_deps/`, `Containerfile`, `public/`, `server/`, …) is code
and still runs them.

Not touched: `website-deploy.yml` (the prod build) and `release-gate.yml`'s `website-build`
(the pre-release check, called by `pre-publish.yml` and `publish.yml`). Both keep building the
full site every time, so a broken page still cannot ship.

## Plan

All in `scripts/ci/lanes.mjs`; the workflows already read the lane verdicts and need no logic change.

1. Next to `GO_BUILD` (`scripts/ci/lanes.mjs:46`), add a filtered entry in the same
   `{prefix, keep}` shape `entryMatches` already supports (`lanes.mjs:121`):
   ```js
   // Page text and styling never break the site build, so they skip the website lanes (prod deploy and the release gate still build).
   const isWebsiteContent = (path) => path.startsWith('container/website/content/') || path.endsWith('.css');
   const WEBSITE_CODE = {prefix: 'container/website/', keep: (path) => !isWebsiteContent(path)};
   ```
   Today's CSS files: `app/assets/css/mion.css`, `sites/{rpc,runtypes,benchmarks}/theme.css`.
2. Swap the bare `'container/website/'` for `WEBSITE_CODE` in the three places that list it:
   - `smoke.paths` (`lanes.mjs:89`), so the lane-wide smoke marker ignores content too.
   - `smoke.items.website.paths` (`lanes.mjs:91`).
   - `website.paths` (`lanes.mjs:96`, the pr-heavy lane).
   Both the lane and its item must change: `itemFeeds` first checks `lane.paths`, and the
   lane hash alone can prove every item.
3. Leave the `JS` list alone. `container/` stays in it, so content and CSS remain classified
   (no "unknown path re-runs every lane" fallback) and `js-lint` still runs
   `check-code-imports` over every `<code-import>` in the content tree.
4. Update the prose that describes the lanes:
   - The `website` label line under **PR readiness** in root `CLAUDE.md`: say a commit that
     only changes `content/` or CSS skips the site build even with the label.
   - The header comments of `.github/workflows/pr-heavy.yml` and the `smoke` job comment in
     `.github/workflows/ci.yml` if they say every website change re-runs the build.
   - The lane description comment above `smoke` / `website` in `lanes.mjs`.

## Tests

`packages/devtools/test/ci-lane-contracts.test.ts`:

- Change the existing item assertion (`ci-lane-contracts.test.ts:139`):
  `feeds('smoke', 'container/website/content/index.md')` now returns `[]`.
- Add, in the lane table block, a test that for both `smoke` (lane and `website` item) and
  `website`:
  - `container/website/content/01.rpc/01.intro.md`, `content/…/_dir.yml`,
    `container/website/app/assets/css/mion.css`, `container/website/sites/rpc/theme.css` feed nothing;
  - `container/website/app/components/content/ServerBenchBars.vue`, `app/plugins/…`,
    `nuxt.config.ts`, `content.config.ts`, `_deps/package.json`, `Containerfile`,
    `public/_redirects` feed the lane.
- Extend the temp-repo hash test (`'hashes a docs-only change identically to its base…'`,
  around `ci-lane-contracts.test.ts:214`) or add a sibling: a commit touching only a content
  page and a `.css` file keeps the `website`, `smoke` and `smoke.website` hashes equal to the
  base, while a `.vue` edit changes them. `decide(... baseHashes)` then reports `run: false`.
- The existing "classifies every tracked path" and "feeds the docs content into the js lane"
  tests must still pass unchanged (they prove step 3).

Run: `pnpm exec vitest run ci-lane-contracts`, then `pnpm miondevx core lanes` on a scratch
commit that edits one content page to see `website` and `smoke.website` hashes unchanged.

## Docs

None on the website, because this only changes which CI jobs run; contributors read it in
root `CLAUDE.md` (step 4).

## Out of scope

- `release-gate.yml` `website-build` and `website-deploy.yml`: they always build, by design.
- `js-lint` / the `js` lane: content still feeds it, so code-import checks keep running.
- `public/` assets: they count as code (the user chose content + CSS only).
- The `bench` lane and `container/benchmarks/`.

## Done when

- A PR touching only `container/website/content/**` and/or `container/website/**/*.css` shows
  `smoke.website` and `website` as skip in the "CI lanes" summary, label or not.
- A PR touching any other `container/website/` file runs them as before.
- `ci-lane-contracts.test.ts` covers both directions and passes; `pnpm run lint` is clean.
- The simplify-comments pass ran on every touched source file, committed on its own (no
  website page is touched, so no simplify-docs pass).
