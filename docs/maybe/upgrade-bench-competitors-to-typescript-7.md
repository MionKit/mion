# Upgrade benchmark competitors to TypeScript 7 (deferred — too early)

**Status:** todo — deliberately deferred. Do NOT do this yet: it is too early, and it is not yet clear the competitor toolchains work on stable `typescript@7` at all.
**Created:** 2026-07-08
**Related:** our own resolver's tsgo pin is kept current separately via `pnpm rtx core bump-tsgolint` (see [`SETUP.md`](../../SETUP.md#bumping-the-tsgolint-pin)). This todo is the competitor-side analogue.

## What

The benchmark harness ([`container/benchmarks/`](../../container/benchmarks/)) pins the pre-release `@typescript/native-preview@7.0.0-dev.20260511.1` in its competitor deps. TypeScript 7.0 has since shipped stable under the plain `typescript` npm tag. When the competitor toolchains support it, move those pins from `@typescript/native-preview` to stable `typescript@7` so the comparison uses the same compiler a real user would run.

## Where native-preview is actually used (evidence)

Two competitor `_deps` packages pin it — not one:

- **typia** — [`_deps/competitors/typia/package.json`](../../container/benchmarks/_deps/competitors/typia/package.json): `@typescript/native-preview@7.0.0-dev.20260511.1` alongside `typia@13.0.0-dev.20260511`, `ttsc@0.10.2`, `@ttsc/unplugin@0.10.2`. typia **produces its validators through it**: its tsgo path is the `samchon/ttsc` toolchain (typia ships a Go-native transform that plugs into ttsc), driven here via `@ttsc/unplugin`'s esbuild adapter ([`esbuild.config.mjs`](../../container/benchmarks/competitors/typia/esbuild.config.mjs)). Per that file, "the first build compiles typia's native plugin once via ttsc's OWN embedded Go toolchain (no system Go required) and caches it under `node_modules/.ttsc/`" — i.e. typia builds a native Go plugin per environment/image, then reuses the cache.
- **ts-runtypes** (our own competitor entry) — [`_deps/competitors/ts-runtypes/package.json`](../../container/benchmarks/_deps/competitors/ts-runtypes/package.json): pins it too, but only for the **compile-time-phase tiers** of the `compiletime` bench (the README notes "ts-runtypes needs `@typescript/native-preview` (tsgo) in its competitor deps for the strip/typecheck tiers; typia already ships it"). Our *runtime* validators come from the Go resolver binary (`@ts-runtypes/bin`), never native-preview.

`zod`, `typebox`, and `ajv` never touch it.

## Why it makes ~no difference to the headline numbers

This is the important part — the upgrade is low-value:

| Benchmark | Exercises the competitor tsgo pin? | Effect of the bump |
|---|---|---|
| **validation** (runtime ops/sec) | No — runs the already-bundled/generated code | None. The generated validator is driven by the *library* version (typia@13-dev), not the tsgo version. Other competitors don't use tsgo at all. |
| **typecost** (type-instantiation count) | No | **None.** [`typecost.mjs`](../../container/benchmarks/typecost/typecost.mjs) compiles every probe with ONE shared `typescript@6.0.3` (`import ts from 'typescript'`, pinned in `typecost/package.json`) — measured identically for all competitors, independent of their pins. |
| **compiletime** (strip / typecheck / full build phases) | **Yes** | The only bench where the pin actually runs ([`compiletime.mjs`](../../container/benchmarks/compiletime/compiletime.mjs): all three tiers measured on tsgo). Build-phase *timings* could shift, but these are noisy/host-dependent, not a headline metric. |

Note the refinement of the original intuition ("maybe type-instantiation count changes"): typecost is version-uniform (shared 6.0.3), so it would **not** move. The only bench that touches the competitors' tsgo pin is `compiletime`, and only for build-phase timing.

## Why it's too early / risky

- typia pins `typia@13.0.0-dev.20260511` and `@typescript/native-preview@7.0.0-dev.20260511.1` at the **same dev date** — its Go-native ttsc transform is matched to a specific tsgo *dev* build. Stable `typescript@7` is very likely not wired into typia's ttsc toolchain yet, and typia@13 itself is still a dev build. Bumping native-preview alone would probably break typia's transform outright.
- The whole typia path is fragile: `ttsc` + `@ttsc/unplugin` (both pinned 0.10.2) build a native Go plugin through ttsc's embedded Go toolchain, re-derived per image. A tsgo generation change forces that native plugin to rebuild and can hit ttsc/tsgo compatibility gaps.
- The compiler's npm identity changed: the tsgo binary now ships under `typescript@7`, not `@typescript/native-preview`. ttsc / @ttsc/unplugin discover the `tsgo` bin from the native-preview package layout; stable `typescript@7`'s bin layout must be verified to still be found.

## Trigger to revisit

Do it once typia ships a **stable (non-dev) release whose ttsc toolchain targets stable `typescript@7`**, and confirm `ttsc` / `@ttsc/unplugin` support that tsgo generation. Until then this is blocked on upstream, not on us.

## Concrete steps (when unblocked)

1. Edit the **checked-in `_deps` sources** (never the git-ignored `.bench-deps/` staging copies):
   - `_deps/competitors/typia/package.json` — replace `@typescript/native-preview` with `typescript@7.x`; bump `typia`, `ttsc`, `@ttsc/unplugin` to versions that target stable tsgo.
   - `_deps/competitors/ts-runtypes/package.json` — replace `@typescript/native-preview` with `typescript@7.x` (compile-time tiers only).
2. Verify ttsc's tsgo discovery: native-preview exposed a `tsgo` bin; confirm the ttsc toolchain finds the compiler under stable `typescript@7` (the `node_modules/.ttsc/` native-plugin cache may need clearing so it rebuilds against the new tsgo).
3. Rebuild + push the GHCR bench image (`pnpm rtx container build-image` then `pnpm rtx container push`) — `_deps` changes are inert until the image is republished (the known stale-bench-image gotcha).
4. Re-run the suite (`pnpm rtx bench --full`); confirm typia still emits validators (its validation column is present, not `err`) and the compiletime tiers still run. typecost should come back byte-identical (shared 6.0.3).
5. Do NOT hand-edit `.bench-deps/` — it regenerates from `_deps/` at image build.

## Not a correctness issue

Nothing here affects RunTypes' own build, tests, publishing, or runtime. It only makes the typia comparison use the same stable compiler a real typia user would run — purely representativeness. Safe to leave indefinitely.
