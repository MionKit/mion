---
type: fix
spec: guidelines
status: ready
created: 2026-08-09
---

# The escape prints resolved DEFAULT type arguments, moving the id

## Problem

`getRunType<T>()` / `embedType<T>()` render their type text from the resolved
checker type, which spells type arguments even when they are the declaration's
own defaults. A typed array is the clearest case:

    export type A = Int32Array;

    $ ts-runtypes convert --to builders src/main.ts
    export const aRT = getRunType<Int32Array<ArrayBuffer | SharedArrayBuffer>>();

The CLASS is right, but `Uint8Array` and `Uint8Array<ArrayBuffer |
SharedArrayBuffer>` are not the same type everywhere: modern lib versions made
the typed arrays generic over their buffer, so whether the explicit arguments
are identical to the bare name depends on the consuming project's `lib`. In the
resolver environment the fuzz lane scans with, they resolve to DIFFERENT ids
(`ThTJDbf` bare vs `rNlxJDR` explicit), so the declaration silently changes
identity across a conversion. In this repo's own vitest environment the two
agree, which is why nothing caught it.

Same shape for `DataView`, and for any generic class whose parameters have
defaults.

## How it was found

By WIDENING the roundtrip fuzz lane's reroll filter. The lane had excluded the
binary natives since it was written, so the shape had never been converted
under the id oracle. Removing the exclusion failed within a dozen iterations on
two independent seeds. The lane's own comment now records that shrinking the
filter is how its coverage grows.

## Fix direction

Print a class reference WITHOUT type arguments when every argument equals the
declaration's default. The checker knows both (`ClassRef` carries the builtin
name; the declaration's type parameters carry their defaults), so the printer
can compare and drop them, exactly as it already drops a format family's
default params. `escapeTypeText` / `classSpelling` in
`ts-go-runtypes/internal/convert/print.go` are the sites.

Consider whether the same applies to a NON-default argument that happens to be
written differently (`ArrayBufferLike` vs its expansion `ArrayBuffer |
SharedArrayBuffer`) — the alias spelling is the one a human wrote, and printing
the expansion is what makes the two environments disagree here.

## Done when

`type A = Int32Array` converts to `getRunType<Int32Array>()`, the id holds in
both the vitest and resolver environments, and
`packages/ts-runtypes/test/fuzz/convert/convertRoundtrip.ts` drops the
`typedarray` / `dataview` entries from `isConvertibleShape` with the lane
staying green across the seed list.
