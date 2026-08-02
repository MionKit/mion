---
type: chore
spec: guidelines
status: open
created: 2026-07-31
---

# Zero-pad the remaining website content dirs before a 10th page silently reorders them

Found when the json-schema rollout made `2.guide/` the first content dir with ten pages: Nuxt Content sorts numeric prefixes lexicographically, so `10.linting.md` rendered as the SECOND nav entry (`1 < 10 < 2`). Fixed for `2.guide/` on the rollout branch by zero-padding to `01.`–`10.`; every other dir still uses single-digit prefixes.

## Problem

The failure mode is invisible in review: adding a 10th file looks fine in the diff, nothing errors, and only the rendered nav order is wrong. Current counts under [container/website/content/](../../container/website/content/): `1.introduction/` 4 pages, `3.ai-integration/` 4, `7.benchmarks/` **9** — the very next benchmarks page added trips it. The top level (4 dirs plus `8.diagnostics.md` and `index.md`) is safe for the foreseeable future.

## Fix

`git mv` zero-pad the pages in the remaining dirs (`01.` style, matching `2.guide/`). Nuxt strips the numeric prefix from slugs, so URLs are unchanged (`1.` and `01.` produce the same route — verified when fixing the guide). Then sweep references to the old file paths: inter-doc citations in `docs/` and other content pages are NOT covered by the in-container `pnpm run check-links` (that checks code-import paths), so grep for the old names explicitly.

Alternative considered: pad only `7.benchmarks/` now and the others on touch. One mechanical sweep is cheaper than re-discovering this three more times.

## Done when

- Every content page uses a two-digit prefix; nav order verified rendered (`pnpm rtx website dev --agent` or `pnpm rtx website check`); no stale references to the old filenames anywhere in the repo.
