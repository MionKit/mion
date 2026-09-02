# Upgrade benchmark competitors to TypeScript 7 (deferred — too early)

**Status:** todo — deferred. The typia lane already runs on stable `typescript@7` (moved there when the lane was repaired in September 2026); what is left is the mion competitor's compile-time-tier pin, which is low value.
**Created:** 2026-07-08
**Related:** our own resolver's tsgo pin is kept current separately via `pnpm rtx core bump-tsgolint` (see [`SETUP.md`](../../SETUP.md#bumping-the-tsgolint-pin)). This todo is the competitor-side analogue.

## What

The benchmark harness ([`container/benchmarks/`](../../container/benchmarks/)) still pins the pre-release `@typescript/native-preview@7.0.0-dev.20260511.1` in the mion competitor's deps. TypeScript 7.0 has since shipped stable under the plain `typescript` npm tag. Move that pin to stable `typescript@7` so the compile-time tiers use the same compiler a real user would run.

## Where native-preview is actually used (evidence)

One competitor `_deps` package still pins it:

- **typia** — no longer. [`_deps/competitors/typia/package.json`](../../container/benchmarks/_deps/competitors/typia/package.json) installs stable `typescript@7.0.2` next to `typia@13.2.0`, `ttsc@0.23.0` and `@ttsc/unplugin@0.23.0`: ttsc resolves the `typescript` package for its native compiler, compiles typia's Go plugin with the toolchain bundled in `@ttsc/<platform>`, and the image bakes that plugin under `node_modules/.cache/ttsc` at build time ([`esbuild.config.mjs`](../../container/benchmarks/competitors/typia/esbuild.config.mjs) documents the wiring).
- **mion** (our own competitor entry) — [`_deps/competitors/mion/package.json`](../../container/benchmarks/_deps/competitors/mion/package.json): pins it only for the **compile-time-phase tiers** of the `compiletime` bench (the strip / typecheck tiers spawn `node_modules/.bin/tsgo`, falling back to typescript 7's `tsc`). Our *runtime* validators come from the Go resolver binary (`@mionjs/bin`), never native-preview.

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

- The only consumer left is the mion competitor's compile-time tiers, and `compiletime.mjs` already accepts typescript 7's `tsc` bin where no `tsgo` bin exists, so the swap is a one-line manifest change plus an image republish.
- The bench workspace refuses releases younger than 30 days (`minimumReleaseAge`), so pick a `typescript` 7.x at least that old.

## Trigger to revisit

Whenever the compile-time tiers should run on the same stable compiler as the typia lane. Nothing upstream blocks it any more.

## Concrete steps (when unblocked)

1. Edit the **checked-in `_deps` sources** (never the git-ignored `.bench-deps/` staging copies):
   - `_deps/competitors/mion/package.json` — replace `@typescript/native-preview` with `typescript@7.x` (compile-time tiers only).
2. Confirm `compiletime.mjs` picks `node_modules/.bin/tsc` for the strip / typecheck tiers once no `tsgo` bin is installed, and that the mion lane's vite build is unaffected (it never used the pin).
3. Rebuild + push the GHCR bench image (`pnpm rtx container build-image` then `pnpm rtx container push`) — `_deps` changes are inert until the image is republished (the known stale-bench-image gotcha).
4. Re-run the suite (`pnpm rtx bench --full`); confirm typia still emits validators (its validation column is present, not `err`) and the compiletime tiers still run. typecost should come back byte-identical (shared 6.0.3).
5. Do NOT hand-edit `.bench-deps/` — it regenerates from `_deps/` at image build.

## Not a correctness issue

Nothing here affects RunTypes' own build, tests, publishing, or runtime. It only makes the typia comparison use the same stable compiler a real typia user would run — purely representativeness. Safe to leave indefinitely.
