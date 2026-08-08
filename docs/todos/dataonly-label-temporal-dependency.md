---
type: fix
spec: guidelines
status: open
created: 2026-08-08
---

# DataOnly's TypeName label silently depends on the Temporal ambient

Found while migrating the test suites onto the real marker package
([generate-runtypes-dts](../done/generate-runtypes-dts.md), 2026-08-08).

## Problem

The serializer labels a `DataOnly<Named>` instantiation `"DataOnly<Named>"`
(`ts-go-runtypes/internal/cachegen/runtype/dataonly.go`) so the inlining
predicate keeps the entry external. Whether that label composes depends on
whether the global `Temporal` namespace exists in the consumer's program:

- `packages/ts-runtypes/dist/index.d.ts` reaches
  `runtypes/builderTypes.d.ts` → `formats/datetime/temporalFormats.d.ts`,
  which references the global `Temporal` AND augments `DataOnlyNativeExtra`
  (the `DataOnlyNative` tail in `runtypes/dataOnly.ts`).
- With `Temporal` present, the checker keeps the DataOnly object branch as a
  deferred mapped type — `dataOnlyTypeName` recognises it and stamps
  `"DataOnly<Root>"`.
- Without `Temporal` (no `ESNext.Temporal` lib, no polyfill types — a normal
  consumer posture), the degraded references make the checker reduce the
  mapped type early; the recognition finds no mapped flags and the label
  falls back to the inner interface's symbol name (`"Root"`).

Reproduced deterministically during the migration: an inline program with the
temporal ambient stamps `DataOnly<Root>`, the identical program without it
stamps `Root` (same typeIDs, same validators — structure is unaffected).

## Impact

Cosmetic-ish: the fallback label is still non-empty, so `DefaultIsRTInlined`
keeps the entry external either way, and typeIDs never read TypeName. But the
reflection surface (`RunType.typeName`) and the rendered entry-module labels
differ across consumer lib configurations, which is a small nondeterminism a
reflection consumer could trip over — and the "DataOnly<…>" spelling is the
honest one (the entry validates the projection, not the named interface).

## Direction

Options, in rough preference order; all need investigation in
`src/runtypes/dataOnly.ts` type machinery, which is exhaustively budget-tested
(`test/types/dataonly.compile.test.ts`) — tread carefully:

1. Make the `DataOnlyNativeExtra` augmentation resilient: the
   `temporalFormats` augmentation could be structured so a missing `Temporal`
   global degrades to `never` members instead of error types (e.g. indirect
   the Temporal references through conditional `typeof globalThis` probes),
   keeping the ladder deferred.
2. Break the type-only import chain that drags `temporalFormats.d.ts` into
   every program (`builders/static.d.ts` → `builderTypes.d.ts` →
   `temporalFormats.ts`) so the augmentation only loads for consumers who opt
   into `@ts-runtypes/core/formats/temporal` — the module's own design goal
   ("consumers who never import it pay nothing").
3. Accept the label variance and normalise expectations (document it; make
   the serializer prefer the reduced form's inner name in BOTH postures for
   determinism). Weakest, but cheap.

The test lanes currently pin the precise label by always mounting the
canonical `temporal.d.ts` ambient (`testfixtures.TemporalDTS` /
`TEMPORAL_DTS` in the JS helper), so a fix here must flip those pins to the
posture it chooses.
