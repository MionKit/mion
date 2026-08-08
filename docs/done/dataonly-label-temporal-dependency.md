---
type: fix
spec: guidelines
status: done
created: 2026-08-08
updated: 2026-08-08
---

# DataOnly silently collapsed to the identity without the Temporal lib

Filed (as a cosmetic label nondeterminism) while migrating the test suites
onto the real marker package
([generate-runtypes-dts](generate-runtypes-dts.md), 2026-08-08).
Implementation upgraded the diagnosis: the label was the visible tip of a
real static-type soundness bug.

## The actual problem (deeper than filed)

`formats/datetime/temporalFormats.ts` guards its global-`Temporal` references
with `TemporalInstanceOf<K> = typeof globalThis extends {Temporal: Record<K,
{prototype: infer I}>} ? I : unknown`. The `unknown` fallback is correct for
the format brand aliases (`unknown & {brand}` keeps the intersection the Go
scanner detects) — but the `DataOnlyNativeExtra` augmentation reused it, and
that interface is consumed as a UNION:
`DataOnlyNative = Date | RegExp | DataOnlyNativeExtra[keyof …]`.

With the Temporal lib absent (the default consumer posture — the augmentation
is ALWAYS loaded via `index.d.ts → builders/static → builderTypes →
temporalFormats`), the eight members became `unknown`, the union absorbed to
`unknown`, and DataOnly's keep arm `T extends string | … | DataOnlyNative`
became `T extends unknown` — true for every `T`. Consequences:

- **`DataOnly<T>` = identity** at the type level: methods, Promises, and
  symbols survived in `createJsonDecoderFn` / `createBinaryDecoderFn` return
  types — exactly the over-promise `decodeReturnType.test.ts` exists to
  prevent. That suite never caught it because every type-level test compiles
  in a program that already has the temporal ambient
  (`test/support/temporal-ambient.d.ts`).
- **The reflection label degraded** (`Root` instead of `DataOnly<Root>`) —
  no mapped type was ever instantiated, so the serializer's recognition had
  nothing to match. This was the originally filed symptom.
- The RUNTIME projection (the Go emitter computes its own) was never
  affected; hashes and validators were identical in both postures.

## What shipped

One-file fix in `packages/ts-runtypes/src/formats/datetime/temporalFormats.ts`:
a `never`-falling twin guard (`TemporalInstanceOrNever<K>`) used by the eight
augmentation members. `never` vanishes from the union, restoring the
documented no-augmentation tail (`Date | RegExp`); a real Temporal consumer
still gets the real types, and Temporal instances are still KEPT verbatim by
DataOnly. The brand aliases and `TemporalBaseByFormatName` keep the `unknown`
fallback — correct in their intersection/base positions. The guard comment now
documents the two fallbacks and why they must differ.

Of the todo's directions, "make the augmentation resilient" won — and turned
out to need no new probe machinery, only the right fallback on the guard that
already existed. Splitting the import chain (option 2) is unnecessary now:
loading the augmentation is harmless once its members degrade to `never`.

## Pins

- `packages/ts-runtypes/test/types/dataonlyTemporalPosture.test.ts` — compiles
  probes against the BUILT dist with the in-process TypeScript compiler in
  both postures: without any Temporal types the projection still drops
  non-data members (fails against the pre-fix dist — verified), and with the
  canonical temporal ambient the projection holds AND `Temporal.Instant` is
  kept verbatim.
- `ts-go-runtypes/internal/compiler/resolver/dataonly_test.go` — three
  NO-ambient tests (`setupInline` with an empty `temporal.d.ts` to suppress
  the injected ambient): static `getRunTypeId<DataOnly<User>>()` and
  value-first `getRunTypeId(u)` both stamp `TypeName="DataOnly<User>"` on a
  `KindObjectLiteral` root, plus form-equivalence on one reflection id (the
  marker test coverage rule).

Not a fuzz candidate: two deterministic compile postures, no input space.

## Done when — met

`DataOnly<T>` projects identically with and without the Temporal lib; the
reflection label composes in both postures; Temporal instances stay kept when
the lib exists; all existing budgets and suites green. No website change —
the fix makes behavior match what the docs already promise.
