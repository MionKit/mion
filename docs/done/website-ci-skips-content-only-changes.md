---
type: chore
spec: full-plan
status: done
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

1. Next to `GO_BUILD`, add a filtered entry in the same `{prefix, keep}` shape `entryMatches`
   already supports, with the check inline:
   ```js
   const WEBSITE_CODE = {prefix: 'container/website/', keep: (path) => !path.startsWith('container/website/content/') && !path.endsWith('.css')};
   ```
   Today's CSS files: `app/assets/css/mion.css`, `sites/{rpc,runtypes,benchmarks}/theme.css`.
2. Swap the bare `'container/website/'` for `WEBSITE_CODE` in the three places that list it:
   - `smoke.paths`, so the lane-wide smoke marker ignores content too.
   - `smoke.items.website.paths`.
   - `website.paths` (the pr-heavy lane).
   Both the lane and its item must change: `itemFeeds` first checks `lane.paths`, and the
   lane hash alone can prove every item.
3. Leave the `JS` list alone. `container/` stays in it, so content and CSS remain classified
   (no "unknown path re-runs every lane" fallback) and `js-lint` still runs
   `check-code-imports` over every `<code-import>` in the content tree.
4. Update the prose that describes the lanes:
   - The header and `container-build` step comments of `.github/workflows/pr-heavy.yml`, and
     the `smoke` job comment in `.github/workflows/ci.yml`.
   - The lane description comment above `smoke` / `website` in `lanes.mjs`.

## Tests

`packages/devtools/test/ci-lane-contracts.test.ts`:

- Change the existing item assertion in `feeds each item its own paths…`:
  `feeds('smoke', 'container/website/content/index.md')` now returns `[]`.
- Add, in the lane table block, a test that for both `smoke` (lane and `website` item) and
  `website`:
  - `container/website/content/01.rpc/01.intro.md`, `content/…/_dir.yml`,
    `container/website/app/assets/css/mion.css`, `container/website/sites/rpc/theme.css` feed nothing;
  - `container/website/app/components/content/ServerBenchBars.vue`, `app/plugins/…`,
    `nuxt.config.ts`, `content.config.ts`, `_deps/package.json`, `Containerfile`,
    `public/_redirects` feed the lane.
- No separate temp-repo hash test: `laneHashes` picks a lane's files only through `matches` /
  `itemFeeds`, which the path test pins, and the existing docs-only hash test pins the hashing.

`packages/devtools/test/website-links.test.ts` (added after review): a CSS-only commit no longer
builds the site on a PR, so `website-css-imports` checks that every relative `@import` in
`app/**/*.css` and `sites/**/*.css` points at a file that exists. Page text keeps its existing
link and anchor checks there, plus `check-code-imports`. What no PR check catches any more:
frontmatter that breaks the `content.config.ts` schema, an unknown MDC component, or a broken
non-import CSS rule. Those first fail at the release gate.

- The existing "classifies every tracked path" and "feeds the docs content into the js lane"
  tests must still pass unchanged (they prove step 3).

Run: `pnpm exec vitest run ci-lane-contracts website-links`, then `pnpm miondevx core lanes` on a scratch
commit that edits one content page to see `website` and `smoke.website` hashes unchanged.

## Docs

None. This only changes which CI jobs run, so the code and its workflow comments are the
record. Root `CLAUDE.md` stays unchanged: it explains the overall setup, not CI details.

## Out of scope

- `release-gate.yml` `website-build` and `website-deploy.yml`: they always build, by design.
- `js-lint` / the `js` lane: content still feeds it, so code-import checks keep running.
- `public/` assets: they count as code (the user chose content + CSS only).
- The `bench` lane and `container/benchmarks/`.

## Done when

- A PR touching only `container/website/content/**` and/or `container/website/**/*.css` shows
  `smoke.website` and `website` as skip in the "CI lanes" summary, label or not.
- A PR touching any other `container/website/` file runs them as before.
- `ci-lane-contracts.test.ts` covers both directions, `website-links.test.ts` covers CSS imports, both pass; `pnpm run lint` is clean.
- The simplify-comments pass ran on every touched source file, committed on its own (no
  website page is touched, so no simplify-docs pass).
