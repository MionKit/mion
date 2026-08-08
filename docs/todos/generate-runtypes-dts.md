---
type: chore
spec: full-plan
status: ready
created: 2026-08-08
updated: 2026-08-08
---

# Kill the fake marker module — resolve the REAL `@ts-runtypes/core` in every test

Split out of [fuzz-undocumented-type-duplication](../done/fuzz-undocumented-type-duplication.md)
(2026-08-08). Originally scoped as "consolidate or generate the hand-written
`declare module '@ts-runtypes/core'` stand-in"; a measurement spike (below, same
day) showed the stand-in can be deleted outright and every suite pointed at the
real published package, so this spec now plans that instead. Consolidation and
a `gen-runtypes-dts` codegen command are both superseded.

## Problem

The fake `declare module '@ts-runtypes/core'` overlay that lets test fixtures
resolve the marker package without an install is hand-written **five** times
(the original spec counted two):

| Copy | Lines | Readers |
| --- | --- | --- |
| `packages/ts-runtypes-devtools/test/helpers/inline.ts` (`RUNTYPES_DTS`) | 71 | every plugin test, all 4 fuzz harnesses, the third_party suites |
| `ts-go-runtypes/internal/testfixtures/runtypes.d.ts` | 53 | on-disk Go fixtures via `/// <reference path>` |
| `ts-go-runtypes/internal/compiler/resolver/inline_test.go` (`runtypesDTS`) | 31 | every Go inline resolver test (221 `setupInline` programs) |
| `scripts/core/smoke.mjs` (`RUNTYPES_DTS`) | 9 | the bootstrap smoke |
| `container/benchmarks/transform-wire/transform-wire.mjs` (`RUNTYPES_DTS`) | 8 | the transform-wire benchmark |

All three big copies have drifted from `packages/ts-runtypes/src/index.ts` and
from each other. They declare functions that no longer exist
(`deserializeValidate`, `createStripUnknownKeys`, `createUnknownKeysToUndefined`,
`overrideStripUnknownKeys`, `overrideUnknownKeysToUndefined`) and lack exports
that do (`createCloneExactShapeFn` / `overrideCloneExactShape` — the whole
`'ces'` family — `createMockDataFn`, `createBinarySizerFn`,
`createHasUnknownKeysFn`, `createUnknownKeyErrorsFn`, `createFormatTransformFn`,
`getRunType`). The fuzz README's "Real types, never copies" rule names
`RUNTYPES_DTS` as the one tolerated exception WITHOUT a pin test.

The drift is not hypothetical — it masked a live product bug (next section).

## Spike findings (2026-08-08)

Method: overlay a virtual `node_modules/@ts-runtypes/core/` — the real
`package.json` plus the built `dist/**/*.d.ts` tree (71 files, `cjs/` excluded,
NOT added as program roots) — in place of the fake ambient, in
`setupInlineWith` (Go) and `withInlineSources` (JS). Temporary edits, reverted.

- **Go resolver suite** (221 inline programs): 27.7s → 31.1s (**+13%**,
  ~15ms per program). Failures: **2**, both the DataOnly bug below — **0** with
  the two-line product fix in place.
- **JS devtools suite** (61 files, 664 tests): 74.0s → 71.5s (**no measurable
  cost**). Failures: **1**, a spike artifact of the helper handing the callback
  caller-only sources while a two-client A/B test
  (`transform-modes.test.ts`, go-mode sourcesContent trim) needs the overlay
  for its second client too — a helper-contract choice, not a type
  incompatibility. Semantic failures: **0**.
- `marker.DeclaredInModule` (marker.go:580) recognises marker declarations via
  a package.json walk through the overlay FS — by design; its comment calls the
  ambient-module overlay a workaround this walk was built to remove.
- Every typeID/hash-pinning, diagnostics, and mode-parity test passed
  unmodified: hashes and scan behaviour do not change under the real types.
- `.ts` specifiers inside dist `.d.ts` resolve fine (already proven daily by
  `packages/examples`' typecheck against dist).

### Bug found: `DataOnly<T>` TypeName recognition is dead in production

`ts-go-runtypes/internal/cachegen/runtype/dataonly.go` (`dataOnlyTypeName`)
walks a mapped type up to its enclosing type alias and requires the alias to be
named `DataOnly`. The SHIPPED `DataOnly`
(`packages/ts-runtypes/src/runtypes/dataOnly.ts`) hosts its object mapped type
inside the `DataOnlyLadder<T, Depth>` helper alias, so against the real package
the recognition never fires: TypeName stays empty and `DefaultIsRTInlined`
inlines the whole body into every consumer — precisely the cache-reuse
regression `TestDataOnly_TypeName_NamedInterfaceArg` / `NamedAliasArg` exist to
prevent. The tests pass today only because the fake's SIMPLIFIED `DataOnly`
(mapped type directly inside the alias) matches; the recognizer's own doc
comment quotes the simplified spelling as "the real definition".

Spike-verified fix (two lines): also accept the enclosing alias name
`DataOnlyLadder`, same `marker.DeclaredInModule` gate. With it both TypeName
tests pass against the real package. Land it WITH this migration — the migrated
tests become the pin — and update the recognizer's doc comment.

## Plan

1. **Shared overlay source, one per side.**
   - Go: an exported helper in `internal/testfixtures` (e.g.
     `RealMarkerPackage()`) reading `packages/ts-runtypes/package.json` + the
     `dist/**/*.d.ts` tree into `map[string]string` keyed
     `node_modules/@ts-runtypes/core/...`; fail with an actionable message when
     dist is unbuilt (like the JS `hasBinary` gate).
   - JS: export the equivalent `InlineSources` map from
     `test/helpers/inline.ts`. Dist freshness is already guaranteed by
     `pretest` → `check:builds`.
2. **Fix `dataonly.go`** (accept `DataOnlyLadder`, rewrite the stale comment).
   Pin: the existing `TestDataOnly_TypeName_*` tests, now running against the
   real package.
3. **Go inline tests**: swap the ambient injection in `setupInlineWith` for the
   overlay (spike shape); delete the `runtypesDTS` const; move
   `perfile_test.go` + `inline_server_tsconfig_test.go` `Sources` maps onto the
   overlay.
4. **Go on-disk fixtures**: inject the overlay into the fixture-dir program
   builds (`resolver_test.go` setup, `atomic_test.go`, `tuplelabels`,
   cachegen's `purefunctions` / `typeid` tests), delete
   `testfixtures/runtypes.d.ts` and the `/// <reference path>` lines from the
   fixture files, and point `testfixtures/tsconfig.json` (root `typecheck`
   lane) at dist via `paths` so `tsc --noEmit` still checks the fixtures.
5. **JS**: swap `withInlineSources` onto the overlay; settle the ctx contract
   (callback receives caller-only sources; the overlay is exported for tests
   that spawn their own clients — `transform-modes.test.ts`'s A/B client,
   `module-mode.test.ts`, `rewrite.test.ts`'s raw handshake); `evalCacheFor`
   excludes `node_modules/` keys from scan lists; fuzz harnesses swap their
   `'runtypes.d.ts': RUNTYPES_DTS` key for the overlay spread (SRC_OVERLAY
   coexists — dist d.ts IS src's declaration emit); third_party suites write
   the overlay files into their scratch dirs instead of the fake; delete
   `RUNTYPES_DTS`.
6. **smoke.mjs**: read the overlay from dist (the smoke already requires the
   built dists).
7. **transform-wire**: the bench container already mounts the real package at
   `/bench/competitors/ts-runtypes/node_modules/@ts-runtypes/core`
   (bench.mjs), so on-disk resolution should replace the fake for the
   container run; verify the host-run path (`--pkg`) resolves too, else feed
   the overlay read from the repo tree.
8. **Docs**: fuzz README's exception list shrinks to two (both pinned);
   `inline.ts`'s ⚠️ warning block goes with the const; `docs/FUZZING.md` ~300
   and `docs/ARCHITECTURE.md` wherever they describe the ambient overlay.

**Keep** the small purpose-built `.d.ts` consts (`overrideDTS`, `multiFnDTS`,
`anonPureFnDTS`, `numberModeDTS`, `structural_test.go`'s 3-liner,
`formats_test.go`'s sentinel spellings, batchcompile's, …): they are deliberate
single-shape probes, not restatements of the public surface, and several test
spellings the real package must NOT be present for.

## Tests

No new test files: the entire existing suite IS the test — every inline test
now exercises the real resolution path (both `getRunTypeId` call shapes
included, per the marker coverage rule). The DataOnly fix is pinned by the two
existing TypeName tests, which fail without it under the real package. Gate:
`go -C ts-go-runtypes test ./internal/...`, `pnpm test`,
`pnpm rtx core fuzz all`, `pnpm rtx core smoke`, and a bench
`transform-wire` run (host at minimum).

## Done when

No full restatement of the public marker surface exists anywhere in the repo
(JS helpers, Go tests, Go fixtures, scripts, bench). Every suite resolves
`@ts-runtypes/core` to `packages/ts-runtypes/dist` — drift is impossible by
construction, so no drift gate is needed. The DataOnly TypeName tests pass
against the real package. The fuzz README exception list no longer names
`RUNTYPES_DTS`. Accepted cost: ~+13% on the Go resolver package (~3.4s), ~0%
on the JS suite.

## Out of scope

- Replacing the purpose-built minimal `.d.ts` shape-probes (listed above).
- `temporal.d.ts` / `temporalDTS` — a lib stand-in, not the marker module.
- Generating any `.d.ts` (the superseded option 2).
