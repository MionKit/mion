# One release train and one CI (merge master plan, step 6)

**Status:** done (2026-09-02)
**Created:** 2026-08-24

Step 6 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Steps 1–5 are landed. Goal (settled decision 2): every published package — now all `@mionjs/*`,
after the namespace rename — ships from one `version.json` lockstep train through `main` → `prod`,
with ONE standing exception: the three `@mionjs/drizzle-orm-*-core` packages (see below).

**Scope note (updated 2026-09-01):** most of this has now landed. Steps 3–5 unified CI
(`pull-requests.yml` and `nuxtjs.yml` retired, mion lanes in `ci.yml`), deleted the lerna-era
publish scripts, and taught `pack.mjs` to pack both families.

The **versioning and publish-flow tasks landed with the devtools merge**
([merge-devtools-into-one-mion-package.md](merge-devtools-into-one-mion-package.md)), because
they blocked it: renaming `@ts-runtypes/devtools` changes its tarball name, and
`publish-tarballs.mjs` filtered the release train by the `ts-runtypes-` prefix, so the renamed
package would have silently stopped publishing. `e2e.mjs` also hard-fails when the `@mionjs/*`
packages are not in lockstep, and the merged devtools cannot sit on both lines at once.

What that change did:

- every non-drizzle `@mionjs/*` package moved onto the `version.json` lockstep (0.12.2), so
  `readMionVersion()` and `readVersion()` in `e2e.mjs` converge with no logic change
- `publish-tarballs.mjs`'s `isOnTheReleaseTrain` is now `mionjs-` and its `rank()` prefixes
  follow the renamed tarballs
- `verify-live.mjs` derives its package list from the workspace instead of a hardcoded three,
  so a newly published package cannot go unverified
- the drizzle `versionLine` exception is untouched, as this spec requires

**The last piece landed on 2026-09-02**, when the leftovers were audited against the tree:

- `scripts/lib/publish-order.mjs` now derives the leaves-first order from the workspace
  (dependency depth over `dependencies`, `peerDependencies` and `optionalDependencies`,
  the staging-time payloads as leaves under `@mionjs/bin` / `@mionjs/uws`). The hand-kept
  ranks gave every framework package the same rank and sorted by name, which would have
  promoted `@mionjs/core` before `@mionjs/run-types` and `@mionjs/client` before
  `@mionjs/core`. `publish-tarballs.mjs`, `stage-approve.mjs`, `manual-publish.mjs`,
  `publish.mjs` and `unpublish.mjs` all read it; `stage-approve` waits for the top of the
  train (the packages nothing depends on) before dispatching the deploy.
- `manual-publish.mjs` still filtered tarballs by the old `ts-runtypes-` prefix, so a
  bootstrap publish would have held back every lockstep package; it filters `mionjs-` now.
- `unpublish.mjs` and `publish.mjs` listed three packages by hand; both derive the set.
- The npm-backend e2e (`post-publish.yml`) skipped the mion consumer lanes as "not on the
  train yet"; it runs them against the live registry now.
- Stale "until step 6" notes in `pack.mjs`, `build-binaries.mjs`, `build-uws-binaries.mjs`,
  `e2e.mjs`, the env registry and the release-to-prod skill were rewritten.
- Pinned by `packages/devtools/test/publish-order.test.ts`.

**The FIRST unified release itself** (the bump, the `prod` branch, the missing `v0.12.2`
tag, the owner actions) is its own spec:
[../todos/first-unified-release.md](../todos/first-unified-release.md). The task list and
done criteria below are kept as written at the time.

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

- ~~**Versioning**~~ — landed with the devtools merge. Every non-drizzle `@mionjs/*` is at
  0.12.2. The first joint RELEASE still needs a bump above that.
- **Publish flow (partly landed):** `publish-tarballs.mjs` and `verify-live.mjs` are done. Still
  to check against a real cut: `publish.mjs` / `manual-publish.mjs` / `unpublish.mjs` ordering
  (runtypes first, then `@mionjs/core`, then its dependents), and `stage-approve.mjs`'s
  leaves-first walk over the new packages. The uWebSockets.js mirror is part of the set:
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
