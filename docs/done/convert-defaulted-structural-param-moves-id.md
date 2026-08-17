---
type: fix
spec: guidelines
status: done
created: 2026-08-17
---

# `--to builders` silently moves the id of a defaulted structural param brand

## Problem

Converting `TF.FormattedArray<string[], {uniqueItems: false}>` with
`--to builders` prints the generic spelling
`RT.array(TF.string(), {uniqueItems: false})`, which resolves a DIFFERENT
structural id (observed `DxTv1xz` → `dZPrjlH`), and a follow-up `--to type`
then drops the brand entirely (`string[]`). Identity preservation is the one
thing convert promises never to break.

## Why

The public params surface in
[packages/ts-runtypes/src/formats/structural.ts](../../packages/ts-runtypes/src/formats/structural.ts)
declares `readonly uniqueItems?: true` — `false` is outside the public
builder surface, so the printed params bag does not reconstruct the original
brand. The precedent for exactly this shape is
`TestChain_RegexPresetEscapesGenericSpelling`
([ts-go-runtypes/internal/convert/roundtrip_test.go](../../ts-go-runtypes/internal/convert/roundtrip_test.go)):
a brand whose params cannot be spelled by the public builders must ride the
exact `getRunType<TypeFormat<…>>` constructor escape instead of the generic
spelling.

It was masked historically because only the (now removed) json-schema
convert target ever exercised defaulted-param brands; the builders printer
never had coverage for them. `minItems: 0` / `minProperties: 0` round-trip
correctly and stay pinned by `TestChain_StructuralParamsAtTheirDefault`; the
`uniqueItems: false` arm was trimmed from that test rather than pinning the
id-moving behavior (2026-08-17, during the json-schema-input removal).

## Fix direction

Decide, per structural family, which param VALUES are outside the public
builder surface (`uniqueItems: false` is the known case; audit the other
literal-valued keywords for equivalents). For those, the builders printer
must take the constructor escape route (`exactBrandType` /
`getRunType<TypeFormat<…>>`), mirroring the `isRegex` precedent. Re-add the
trimmed `uniqueItems: false` chain arm as the regression pin.

## Done when

- `TF.FormattedArray<string[], {uniqueItems: false}>` chain-converts
  type → builders → type with the id held.
- The trimmed arm is restored in `TestChain_StructuralParamsAtTheirDefault`
  (or an equivalent pin).

## Shipped (2026-08-17)

Implemented as planned, with the raw-brand spelling as the escape (the
structural twin of the `isRegex` TypeFormat-constructor escape):

- `structuralParamsPubliclySpellable` + `rawStructuralBrandType`
  ([ts-go-runtypes/internal/convert/print.go](../../ts-go-runtypes/internal/convert/print.go))
  whitelist the public bag surface per family (formattedArray: numeric
  `minItems`/`maxItems`, `uniqueItems` only as literal `true`;
  formattedObject: numeric key-count bounds + the derived string-list
  params). Anything else — `uniqueItems: false`, an unknown hand-spelled
  sentinel key — is out of surface.
- The TYPE target prints the raw sentinel intersection
  (`string[] & TF.StructuralBrand<'formattedArray', {uniqueItems: false}>`),
  which resolves the identical annotation and id; the BUILDERS target rides
  `builderEscape`, whose quoted type text now takes the same raw spelling —
  so `getRunType<…raw…>()` compiles and the id holds.
- Out-of-surface params BESIDE contains/patternProperties/propertyNames
  slots refuse (CNV001) rather than mis-spell — no raw spelling carries the
  child slots too.
- Pinned by `TestChain_UniqueItemsFalseEscapesGenericSpelling`
  ([ts-go-runtypes/internal/convert/roundtrip_test.go](../../ts-go-runtypes/internal/convert/roundtrip_test.go)):
  builders form uses the escape, never the generic bag, and the follow-up
  `--to type` keeps the raw spelling with the id held.
