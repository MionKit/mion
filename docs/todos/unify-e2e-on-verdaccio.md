# Move mion's publish e2e into the verdaccio container (merge master plan, step 5)

**Status:** open
**Created:** 2026-08-24

Step 5 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Requires [unify-workspace-and-toolchain.md](unify-workspace-and-toolchain.md) landed (can run in
parallel with step 4). Goal: one pre-publish gate — the `tsrt-e2e` image's verdaccio serves BOTH
package families, mion's consumer checks run inside the same matrix, and the local-tarball
`test-publish/` flow is retired.

## Background

mion today: `test-publish/` installs `file:./tarballs/*.tgz` via pnpm overrides and runs 4 specs
(json flow, binary, packaged-sources, build-output inlining), driven by
`scripts/pre-publish-test.sh` — manual, host-only, no registry semantics. ts-run-types today:
verdaccio 6.7.2 inside `container/pre-publish-e2e/`, `e2e-serve.sh` publishes the packed tarballs
in dependency order, consumer apps under `apps/` install from the registry and a feature matrix +
host-native smoke run against them, all fronted by `rtx release e2e` with container / host-npx /
npm backends.

## Tasks

- **Verdaccio config:** add `@mionjs/*` to `registry/verdaccio.yaml` (and the CI host-npx twin
  `.github/verdaccio.yaml`) with the same posture as `@ts-runtypes/*` — served ONLY from local
  publishes, never proxied to npmjs (both scopes have live npm versions that must not leak in).
- **Publish order:** extend `e2e-serve.sh` to publish the mion tarballs after the runtypes ones:
  platform binaries → bin → core → devtools → `@mionjs/core` → router/client/drizzle → mion
  devtools → platform adapters; fail loudly if a required family is missing.
- **mion consumer app:** port the 4 `test-publish` specs into a new `apps/` member (e.g.
  `apps/mion-server`) driven by `build-all.mjs`: installs `@mionjs/*` from verdaccio, boots the
  test server (the old `globalSetup.ts` / port 8086 flow), runs the json/binary round-trips,
  inspects the installed tarball contents, and asserts compiled runtypes + harvested mappers are
  inlined in a production build. Include a Bun lane if `platform-bun` is to be covered
  (bun is already baked into the image).
- **Pack + gate:** extend `scripts/release/pack.mjs` (and the e2e receipt) to pack the 11 public
  `@mionjs/*` packages alongside the 10 runtypes ones; `rtx release e2e` needs no new flags, just
  the bigger tarball set. Rebuild + push `tsrt-e2e` (`pnpm rtx container push e2e`).
- **Deletions:** `test-publish/` (workspace, lockfile, specs — all superseded),
  `scripts/pack-packages.sh`, `scripts/pack-and-install.sh`, `scripts/pre-publish-test.sh`, and
  the CLAUDE.md sections that describe them.

## Done criteria

- `pnpm rtx release e2e` (container backend) publishes both families to verdaccio and the full
  matrix — runtypes apps AND the mion consumer app — passes locally.
- The `host-npx` and `npm` backends still work (npm backend gains the mion packages only after
  the first unified release in step 6; guard accordingly).
- `test-publish/` and the three shell scripts are gone; nothing references them.
