---
type: fix
spec: guidelines
status: done
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

## What shipped (2026-09-02)

- typia lane: `typia@13.2.0` + `ttsc@0.23.0` + `@ttsc/unplugin@0.23.0` + `typescript@7.0.2`
  (the newest set the bench workspace's 30-day `minimumReleaseAge` allowed on the day;
  typia 14 / ttsc 0.28 were a week old). `@typescript/native-preview` left the lane.
- `esbuild.config.mjs` names its tsconfig as the ttsc `project` and hands files outside
  the competitor dir back to esbuild. The Containerfile installs typia fatally, warms the
  plugin fatally, proves `node_modules/.cache/ttsc/plugins/*/plugin` and drops the 4 GB Go
  build cache in the same layer. `compiletime.mjs` accepts typescript 7's `tsc` bin.
- `MION_VALIDATION_BENCH_NO_TYPIA=1` is gone from `ci.yml`, `pr-heavy.yml` and the
  `--quick` defaults: with the plugin baked, the typia build is a one-second esbuild pass.
- zod: the three all-optional cases carry the plain-object guard on the input side
  (`z.custom(...).pipe(schema)`), so zod agrees with RunTypes on every sample again, as the
  Correctness page and the alignment report state.
- Verified in-container on an image built from these manifests: typia 206 ok / 0 fail /
  0 errored (73 not-supported), zod 239 ok / 0 fail on validationErrors, no plugin
  recompile at run time, `bench typecheck` and `bench smoke` green.
- NOT done here: the republish. The fixing session had the GHCR credentials but no arm64
  emulation and no route to Docker Hub for the base image, so `pnpm rtx container push
  website` and `pnpm rtx container push e2e` (its Containerfile label changed in PR #201)
  run from a maintainer host after merge. Until then CI rebuilds the website image
  locally (the staleness guard doing its job), which is slow but green.

## Plan (approved 2026-09-02, implemented on branch fix/bench-typia-lane)

Findings that shaped it:

- `minimumReleaseAge` (30 days) in `_deps/pnpm-workspace.yaml` applies to exact pins
  too, so typia 14 / ttsc 0.28 (Aug 2026) were not installable on the day of the fix.
  The newest pair old enough: `typia@13.2.0` + `ttsc@0.23.0` + `@ttsc/unplugin@0.23.0`
  (unplugin peers its exact ttsc line; typia 13.x wants `ttsc >= 0.19.2`).
- ttsc >= 0.19 resolves the `typescript` package for its native compiler (TypeScript 7
  ships it as `@typescript/typescript-<platform>`), so the lane installs
  `typescript@7.0.2` and drops `@typescript/native-preview`. ttsc bundles its own Go
  toolchain in `@ttsc/<platform>` (no download, no system Go) and caches the compiled
  plugin under `<workspace>/node_modules/.cache/ttsc/plugins/<key>/plugin`, not `.ttsc`.
- `@ttsc/unplugin` now emits only the project's OWN files: the shared harness under
  `../../shared` is in the program but never emitted, so the esbuild wrapper names its
  tsconfig as the `project` and hands files outside the competitor dir back to esbuild.
- zod 4.4.3's `z.object` accepts Date / Map / Set / RegExp for an all-optional shape and a
  `.refine` sees the parsed copy. The Correctness page and the alignment report both
  record zod as agreeing with RunTypes here, so the three cases get the plain-object
  guard back on the input side (`z.custom(...).pipe(schema)`) rather than an override.

Steps:

1. `_deps/competitors/typia/package.json`: the four pins above (+ esbuild, @types/node).
2. `competitors/typia/esbuild.config.mjs`: explicit `project`, project-dir filter, header.
3. `container/website/Containerfile`: typia install fatal; warm step fatal, proves
   `node_modules/.cache/ttsc/plugins/*/plugin`, drops the 4 GB Go build cache in-layer.
4. `compiletime.mjs`: the native compiler bin is `tsgo` (preview) or `tsc` (typescript 7).
5. Drop `MION_VALIDATION_BENCH_NO_TYPIA=1` from `ci.yml`, `pr-heavy.yml` and the
   `--quick` defaults; the baked plugin makes the typia build an esbuild pass.
6. zod: `plainObject()` helper on the three all-optional cases.
7. Tests: `packages/devtools/test/bench-lane-contracts.test.ts` pins the manifest
   agreement, the fatal warm + cache path, the wrapper filter and the zod guard.
8. Docs: benchmarks README, SETUP.md, the audit collector comment, the parked TS 7 note.
9. Validate in-container (build the image on top of the published one, since Docker Hub
   is unreachable from the session), run `bench-one typia`, `bench-one zod`,
   `typecheck`, `smoke`; then the PR-readiness gate; then move this spec to docs/done.
10. Republish: `pnpm rtx container push website` and `push e2e`. The session has the
    GHCR credentials but no arm64 emulation and no Docker Hub route, so the multi-arch
    push has to run from a maintainer host; the PR says so.
