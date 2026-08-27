# One release train and one CI (merge master plan, step 6)

**Status:** open
**Created:** 2026-08-24

Step 6 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Steps 1–5 are landed. Goal (settled decision 2): every published package — 10 `@ts-runtypes/*` +
11 `@mionjs/*` — ships from one `version.json` lockstep train through the `main` → `prod` flow,
with ONE standing exception: the three `@mionjs/drizzle-orm-*-core` packages (see below).

**Scope note (verified against `main`, 2026-08-24):** much of the original step 6 landed during
steps 3–5 — CI is already unified (`pull-requests.yml` and `nuxtjs.yml` retired, mion lanes in
`ci.yml`), the lerna-era publish scripts are deleted, and `pack.mjs` packs both families for the
verdaccio e2e. What remains is the release train itself: the mion packages still sit at 0.8.10,
and `publish-tarballs.mjs` deliberately filters to `ts-runtypes-*` until this step unifies the
versions (CLAUDE.md documents that seam).

## The drizzle-orm exception (already shipped — do not unify it away)

The `@mionjs/drizzle-orm-{pg,mysql,sqlite}-core` packages ride the same release train
(same pack, same e2e, same staging queue) but NOT the same version line. They are marked
`"versionLine": "drizzle-orm"` in their package.json and follow two rules, both implemented
in [scripts/lib/drizzle-line.mjs](../../scripts/lib/drizzle-line.mjs):

- **Align with drizzle.** Their `major.minor` is the drizzle-orm the repo builds against, and
  their peer range is exactly `>=X.Y.0 <X.(Y+1).0` — the range IS the compatibility promise, so
  a consumer reads the version and knows which drizzle it fits. A drizzle-orm upgrade re-stamps
  version, peer range and the committed manifests in the same commit;
  `check-drizzle-versions.mjs` fails every PR until it does.
- **Depend on the family by range, not by pin.** `@ts-runtypes/core` is a PEER on the
  lockstep minor (`>=X.Y.0 <X.(Y+1).0`) plus a workspace devDependency, never a
  `dependencies` entry. Two reasons: the core types are brands, so the consumer's single copy
  must supply them; and `workspace:*` packs as an exact pin, which would change their published
  manifest on every release and defeat the rule below. When the mion packages join the lockstep,
  keep this shape for the dialect packages.
- **Publish only on change.** Their patch moves only when their own published sources
  (`src/**` minus specs, and package.json) changed since their last version bump.
  `bump-version.mjs` stamps that patch at the release cut and leaves untouched packages alone;
  `publish-tarballs.mjs` then skips any tarball whose exact version is already live, after
  DOWNLOADING that live tarball and confirming the published sources are byte-identical. Same
  version with different bytes fails the release instead of silently shipping nothing. A tarball
  older than the live `latest` stages under a `drizzle-X.Y` dist-tag so a backport never moves
  `latest` backwards.

So the unification below covers the OTHER `@mionjs/*` packages. When this step lands, keep the
`versionLine` marker as the filter (never a hard-coded name list), keep them out of the
`version.json` stamping loop, and keep `verify-live` checking them at their own tree versions
rather than at the lockstep version.

## Owner actions

- Branch protections for `main` (rebase-merge PRs, required checks) and `prod` (merge-commit-only
  promotion; `publish.yml`'s `merge-shape` job enforces the commit shape, but the protection
  keeps humans honest).
- The first unified release's npm 2FA stage-approve (`pnpm rtx release stage-approve`), as for
  every release.

## Tasks

- **Versioning:** `@mionjs/*` joins `version.json` lockstep, EXCEPT the three drizzle dialect
  packages (section above). `bump-version.mjs` already stamps
  every `packages/*/package.json` and already skips `versionLine: "drizzle-orm"`; verify it
  handles the rest of the mion set (including private ones like
  `test-server` and `examples`, which move to the same version like the runtypes private
  packages do). First joint version: next minor above 0.12.2 (e.g. 0.13.0); `@mionjs/*` jumps
  from 0.8.10, which npm is fine with.
- **Publish flow:** extend `publish-tarballs.mjs` / `publish.mjs` / `manual-publish.mjs` /
  `verify-live.mjs` / `unpublish.mjs` with the `@mionjs/*` set in dependency-safe order
  (runtypes first, then `@mionjs/core`, then its dependents). `stage-approve.mjs`'s leaves-first
  walk gains the new packages. The uWebSockets.js mirror is part of the set:
  `dist-binaries/publish-order.json` already encodes `@mionjs/uws-<os>-<arch>` payloads BEFORE the
  `@mionjs/uws` shim (staged by `build-uws-binaries.mjs`, invoked from `build-binaries.mjs`), and
  the publish job needs egress to raw.githubusercontent.com for the sha256-verified binary fetch.
- **`prod` branch:** create it from `main` at the first release cut; `pre-publish.yml` /
  `publish.yml` / the release-to-prod skill then apply unchanged. Note for the first release:
  `main-ancestor` and `version-fresh` jobs must pass with the joined history (the version check
  queries npm for the new version across ALL packages — extend its package list).
- **Changelog:** git-cliff (`cliff.toml`) covers the whole repo from now on; mion's pre-merge
  history predates conventional commits, which is fine — the tag pattern starts the changelog at
  the runtypes tags. Commitlint (already enforced by `ci.yml` on PRs) now governs mion work too.
- Update the release-to-prod skill's package expectations and CLAUDE.md's publishing section.

## Done criteria

- A full dry pass: `rtx release preflight` → `pack` → `e2e` green with 21 packages.
- `rtx release tarballs --plan` shows the 18 lockstep packages at the new version and the three
  drizzle ones at their own — each either staged or skipped as verified-identical, never both.
- First unified release ships to npm through `pre-publish.yml` → `publish.yml` →
  stage-approve, and `post-publish.yml`'s live-registry e2e passes including the mion consumer.
- `verify-live` confirms every lockstep package at the unified version and the three drizzle ones at
  their own tree versions; the website deploy gate accepts it.
