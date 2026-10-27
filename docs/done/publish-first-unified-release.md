---
type: chore
spec: full-plan
status: done
created: 2026-10-18
---

# Publish 0.13.0 by hand, then prove the CI release

## What shipped

- **0.13.0, by hand.** npm cannot stage a never-published name and 19 were new, so the owner ran
  `pnpm miondevx release manual-publish` on the bump commit. All 30 packages are live and
  `verify-live` passed. The first run stopped at `native-compiler-win32-x64` (the npm browser
  approval expired); the rerun skipped the 6 already live. Tags pushed: `v0.13.0` on
  `605badfb8`, plus `pre-merge-ts-run-types` and `v0.12.2` on the type-system head `6b89eb4ac`.
- **Site deploy.** A `dry_run` of `website-deploy.yml` from `main` proved the image pulls, the site
  build and check, and the Cloudflare credentials. The first real deploy then ran from `main`.
- **No 0.13.1.** Its staged publish stopped halfway: 16 packages staged, then the drizzle skip
  check refused. npm never stages a version twice, so the same changes became 0.13.2. The cause
  was npm 12's `npm pack --json` shape (keyed by package name, not a list). Fixed in #517 (every
  drizzle skip checked before anything is staged, retried downloads, npm's own error) and #519
  (both shapes parsed, `publish.yml` pins `npm@12.2.1`).
- **0.13.2, through CI.** Release PR #520 into `prod`, merge commit only. Its first gate found a
  real apitypes trim bug (fixed in #521) and a 10 s workerd boot timeout (#522). Then
  `publish.yml` staged 26 packages, skipped the 4 unchanged drizzle ones (still 0.45.1) and
  tagged `v0.13.2`. The owner ran `stage-approve`, which approved them and dispatched the site
  deploy. `post-publish.yml` (dispatched by hand, it has no other trigger) and the deploy are
  green. `latest` on npm is 0.13.2.
- **Found on the way and fixed:**
  - `stage-approve` now refuses a checkout whose `version.json` differs from prod's.
    An old checkout used to look for the wrong version.
  - The release skill now says to dispatch `post-publish.yml` after the approvals.
  - The `mion --version` sample on the site shows 0.13.2.

The two owner actions left (prod's required status checks, archiving the two old repositories)
moved to their own todo.

## Out of scope

Renaming or deprecating the old `@ts-runtypes/*` npm packages: they stay live at 0.12.2 as the
last standalone release.
