---
type: chore
spec: full-plan
status: done
created: 2026-08-08
updated: 2026-08-08
---

# Kill the fake marker module — resolve the REAL `@ts-runtypes/core` in every test

Split out of [fuzz-undocumented-type-duplication](fuzz-undocumented-type-duplication.md)
(2026-08-08). Originally scoped as "consolidate or generate the hand-written
`declare module '@ts-runtypes/core'` stand-in"; a measurement spike (below,
same day) showed the stand-in could be deleted outright, and this shipped the
full deletion. Consolidation and a `gen-runtypes-dts` codegen command were both
superseded.

## Problem

The fake `declare module '@ts-runtypes/core'` overlay that let test fixtures
resolve the marker package without an install was hand-written across the
repo. The original spec counted two copies; implementation found **nine**:

- `packages/ts-runtypes-devtools/test/helpers/inline.ts` (`RUNTYPES_DTS`, 71
  lines — every plugin test, all fuzz harnesses, the third_party suites)
- `ts-go-runtypes/internal/compiler/resolver/inline_test.go` (`runtypesDTS`,
  31 lines — 221 `setupInline` programs)
- `ts-go-runtypes/internal/testfixtures/runtypes.d.ts` (53 lines) plus THREE
  8-line copies in its `atomic/`, `tuplelabels/`, `unresolvedimport/` subdirs
- `ts-go-runtypes/internal/cachegen/purefunctions/walker_test.go`
  (`runtypesDts`, the pure-fn registration surface)
- `scripts/core/smoke.mjs` and
  `container/benchmarks/transform-wire/transform-wire.mjs`

All the big copies had drifted from `packages/ts-runtypes/src/index.ts` and
from each other — declaring functions that no longer existed
(`deserializeValidate`, `createStripUnknownKeys`, `createUnknownKeysToUndefined`,
`overrideStripUnknownKeys`, `overrideUnknownKeysToUndefined`) and lacking real
exports (the `'ces'` family, `createMockDataFn`, `createBinarySizerFn`,
`getRunType`, …). The drift masked two live product bugs (below).

## What shipped

**One mechanism, no stand-ins.** Tests mount the REAL published package — its
`package.json` plus the built `dist/**/*.d.ts` tree (esm AND `dist/cjs/`, since
a node16-style CommonJS importer resolves the `require` export condition) — as
`node_modules/@ts-runtypes/core/...` entries, resolved exactly the way a
consumer install is. Marker declarations are recognised through
`marker.DeclaredInModule`'s package.json walk (its design intent; the ambient
form was documented there as a workaround).

- **Go**: `internal/testfixtures/realmarker.go` — `RealMarkerPackage()` reads
  the package once per process (actionable error when the dist is unbuilt);
  `setupInlineWith` and a `withRealMarker` helper (server-path tests) overlay
  it, never as program roots. The four on-disk fixture dirs instead resolve
  through tsconfig `paths` → `packages/ts-runtypes/dist/index.d.ts` (their
  `runtypes.d.ts` files and every `/// <reference>` line are deleted); the
  root `typecheck` script validates the same route. The purefunctions tests
  pass the program's virtual FS in `marker.Options{FS: prog.FS}` — required
  for the package.json walk to see the overlay.
- **JS**: `test/helpers/inline.ts` — `MARKER_PACKAGE_OVERLAY` (the same map,
  read once per worker; dist freshness guaranteed by `pretest` →
  `check:builds`), injected by `withInlineSources` unless the caller supplies
  a probe ambient; `writeMarkerPackage(dir)` writes it to real disk for
  scratch-dir suites (third_party, wrapper, tsconfig-config,
  references-unbuilt — the latter at the fixture's COMMON parent, since a
  package resolves per-file where an ambient was global).
- **Scripts**: `smoke.mjs` reads the same overlay from dist;
  `transform-wire.mjs` locates the real package (container mount first, then
  the `--pkg` sibling) and injects it as virtual sources — verified on host.
- **`temporal.d.ts` unified too**: the canonical
  `internal/testfixtures/temporal.d.ts` is now embedded Go-side
  (`testfixtures.TemporalDTS`, replacing `inline_test.go`'s hand-written
  mirror) and read JS-side (`TEMPORAL_DTS`), injected alongside the package.

**Kept, deliberately**: the small purpose-built ambient probes
(`overrideDTS`, `multiFnDTS`, `anonPureFnDTS`, `numberModeDTS`,
`structural_test.go`'s 3-liner, `formats_test.go`'s sentinel spellings,
batchcompile's and compile-cli's minimal-project shims, enrich_parity's
4-liner). Each tests a specific declaration shape, several deliberately
diverge from the real surface, and a caller-supplied `runtypes.d.ts` still
suppresses the package injection in both helpers.

## Bugs the fake was masking (fixed here)

1. **`DataOnly<T>` TypeName recognition was dead in production.**
   `cachegen/runtype/dataonly.go` required the mapped type's enclosing alias
   to be named `DataOnly`; the SHIPPED `DataOnly` hosts its object mapped type
   inside the `DataOnlyLadder<T, Depth>` helper alias, so against the real
   package the recognition never fired — TypeName stayed empty and
   `DefaultIsRTInlined` inlined the body into every consumer, the exact
   cache-reuse regression `TestDataOnly_TypeName_*` exist to prevent. The
   tests passed only because the fake's simplified `DataOnly` matched. Fixed
   by accepting `DataOnlyLadder` under the same module gate; the existing
   tests, now running against the real package, are the pin.

2. **`dispatchSetSources` rooted every sources key.** A virtual
   `node_modules/` source is resolution input, not a program root (tsc never
   roots node_modules); rooting a whole package's declaration tree changed
   the checker's instantiation order against the build lane. Fixed with a
   `node_modules/` root filter in `dispatch.go`.

## Finding filed separately

The DataOnly TypeName label (`"DataOnly<Root>"` vs the inner name `"Root"`)
depends on whether the global `Temporal` ambient is present in the program:
the package's declaration graph reaches `formats/datetime/temporalFormats`,
whose `DataOnlyNativeExtra` augmentation references `Temporal`, and without it
the checker reduces the mapped type early. Cosmetic (the label stays non-empty
either way, so inlining behaviour is unaffected) — recorded as
[dataonly-label-temporal-dependency](dataonly-label-temporal-dependency.md).
The test lanes pin the precise label by mounting the canonical temporal
ambient, matching the Go suite's long-standing posture.

## Cost (measured)

Go resolver package 27.7s → ~31s (+13%, ~15ms per inline program); full JS
suite unchanged (74s → 72-77s run-to-run). Accepted per the spike decision.

## Done when — met

No restatement of the public marker surface exists anywhere in the repo; every
suite resolves `@ts-runtypes/core` to `packages/ts-runtypes/dist`, so drift is
impossible by construction and no drift gate is needed. The DataOnly TypeName
tests pass against the real package. The fuzz README's exception list is down
to two entries, both pinned. Gate run: `pnpm test` (287 files / 11281 tests),
`go test ./internal/... ./cmd/...` (29 packages), `pnpm rtx core fuzz`
(unit/value/types/jsonschema/all), `pnpm rtx core smoke`, host
`transform-wire`, `pnpm run lint`, `pnpm run format`. The containerized
transform-wire lane was not run here (needs the GHCR image); its resolution
path is the container mount the bench already makes.
