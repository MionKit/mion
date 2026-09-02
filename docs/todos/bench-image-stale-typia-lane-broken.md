---
type: fix
spec: guidelines
status: ready
created: 2026-09-02
---

# Validation benchmark job: published image is stale and the typia lane cannot be rebuilt

## Intent

The release gate's "validation + type-cost benchmarks (podman)" job fails on `main`. Two
things stack up:

1. The published `ghcr.io/mionkit/tsrt-website:latest` image was built from OLDER website
   manifests than the tree (its deps stamp is `47e25ea5650707c1`; `main` hashes to
   `3c554e1472e5fd86`, see `depsHash` in
   [scripts/container/image.mjs](../../scripts/container/image.mjs)). The staleness guard
   therefore refuses the pulled image and every CI lane rebuilds it from scratch, which is
   slow and, worse, means the job runs an image nobody published.
2. In that from-scratch rebuild the typia competitor lane does not build. Its
   `pnpm install --no-frozen-lockfile` warns "typia install failed; its column degrades
   gracefully", the ttsc warm step is skipped, and at bench time esbuild fails with
   `Could not resolve "typia/lib/internal/_isMultipleOf"` and `_stringLength`: the installed
   `typia@13.0.0-dev.20260511` maps `./lib/internal/*.mjs` in its exports but ships no such
   files, while the ttsc transform (`ttsc@0.10.2`, `@ttsc/unplugin@0.10.2`) still emits those
   imports. `bench: 1 competitor lane(s) failed: typia` then fails the job. `ci.yml` and
   `pr-heavy.yml` hide this by setting `MION_VALIDATION_BENCH_NO_TYPIA=1`; the release gate
   does not, and should not.
3. The same run reports three zod correctness failures the job also counts:
   `zod / OBJECT.interface_all_optional`, `zod / UTILITY.partial` and
   `zod / UTILITY.deep_partial_recursive_mapped` `[validationErrors]: fail — invalid[1]
   accepted` (zod 4.4.3). Either the case's invalid sample is wrong for zod's semantics or
   zod's validationErrors path accepts it; decide per case and fix the case or mark the
   override, the way the other competitor overrides are recorded.

Found on 2026-09-02 by the first release-gate run in this repo
(https://github.com/MionKit/mion/actions/runs/33579204363, job "validation + type-cost
benchmarks"). Predates PR #201, which touches no benchmark code (its Containerfile label
edit changes the hash too, but `main` was already stale without it).

## Direction

- Reproduce the typia lane in the container: `pnpm rtx container build-image website`
  then `pnpm rtx bench --one typia` (or the equivalent `rtx bench` invocation the job
  runs; read `release-gate.yml`). Pin a typia + ttsc pair that agree on the internal
  module layout (a matching dev build of both, or the latest stable typia with its own
  transform), and make the warm step fail loudly instead of "skipped/failed".
- Fix or override the three zod cases with a reason each.
- Then republish the images so the stamp matches the tree:
  `pnpm rtx container push website` (and `e2e`, whose Containerfile label changed in
  PR #201). That needs `GHCR_PAT`; if the session has no credentials, say so in the PR and
  leave the republish to the maintainer as the last step.
- Drop `MION_VALIDATION_BENCH_NO_TYPIA=1` from `ci.yml` / `pr-heavy.yml` only if the
  rebuilt image bakes the plugin so the smoke stays fast (the comment in `ci.yml` explains
  the 200 s cost otherwise).

## Done when

- The release gate's benchmark job passes on `main` with typia enabled and zero
  fail/errored metric-cases.
- The pulled `tsrt-website` image is accepted by the staleness guard (no local rebuild in
  CI).
