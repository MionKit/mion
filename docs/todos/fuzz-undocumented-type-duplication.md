---
type: chore
spec: guidelines
status: ready
created: 2026-08-08
---

# Three type duplications the `srcOverlay.ts` carve-out does not admit to

Split out of the [fuzz-followups audit](../done/fuzz-followups.md) (2026-08-08).

## Problem

[srcOverlay.ts:10-18](../../packages/ts-runtypes/test/fuzz/core/srcOverlay.ts)
states the harness's rule and its single exception:

> This is what keeps the fuzz suites honest. A hand-written copy of a shipped
> type does not fail when the shipped type changes — it silently keeps testing
> the old shape, which is the one failure mode a fuzz suite cannot afford.
>
> The ONE deliberate exception is `FUZZ_FORMAT_PREAMBLE` (typeGen.ts) …

The rule is right. The claim that there is one exception is false — there are
four, and the largest is not the preamble. The audit found the harness otherwise
exemplary: roughly 170 local declarations, and every consumer of a shipped
runtime type imports it. These three are the outliers.

## The three

### 1. Six inline restatements of `src/formats/structural.ts`

In `renderType`, **outside** the preamble, so the independence rationale never
covered them:

| [typeGen.ts](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts) | duplicates |
| --- | --- |
| `:970` `__rtFormatName?: 'formattedArray'` | `FormattedArray`, `structural.ts:113-116` |
| `:974` `__rtContains?: {rt$child; rt$min; rt$max}` | `ContainsSlot`, `structural.ts:101-108` |
| `:984` `__rtFormatName?: 'formattedObject'` | `FormattedObject`, `structural.ts:213-215` |
| `:986-991` `__rtPatternProps?: …` | `PatternPropsSlot`, `structural.ts:190-201` (also re-inlines the `flags: ''` decision documented at `structural.ts:184-189`) |
| `:992-996` `__rtPropNames?: …` | `PropNamesSlot`, `structural.ts:203` |
| `:935-942` `structuralParamsText()` | re-derives `ArrayLiteralKeys` / `ObjectLiteralKeys`, `structural.ts:96,176` |

These are sentinel-encoding spellings, so they are arguably tier (a) in the
preamble's own taxonomy — the independence argument may well justify them. The
defect is that they are undeclared: nothing marks them as a deliberate
exception, so the next reader cannot tell them from an accident.

### 2. `enrich/i18nModel.ts:117-121`

An inline `String<P>` / `TypeFormat` spelling (`MINLENGTH_FMT` and
`patternFmt()`). The stated reason at `:23-26` is legitimate — the i18n fuzz
fixtures are scratch temp dirs with no ts-runtypes install, so a bare specifier
cannot resolve. But unlike the preamble it feeds **no convergence check**, so it
is duplication with no compensating oracle. If `TypeFormat`'s encoding changed,
this file would keep generating the old spelling and the i18n fuzzer would
silently test a plain string instead of a formatted one.

### 3. `RUNTYPES_DTS` — the big one

[ts-runtypes-devtools/test/helpers/inline.ts:37-105](../../packages/ts-runtypes-devtools/test/helpers/inline.ts)
is a hand-written `declare module '@ts-runtypes/core'` covering essentially the
whole public surface: `InjectRunTypeId`, `CompTimeArgs`, `InjectTypeFnArgs`,
`PureFunction`, `getRunTypeId`, every `create*Fn`, all ten `override*` fns,
`StandardSchemaV1`, `RTUtils`, the `register*` fns, and a self-described
"minimal `DataOnly` stand-in". Its own comment calls it a mirror of
`internal/testfixtures/runtypes.d.ts` — a copy of a copy. It duplicates
`src/markers.ts`, `src/runtypes/types.ts`, `src/runtypes/dataOnly.ts`,
`src/createRTFunctions.ts`, `src/overrideRTFunctions.ts` and `src/standard/`.

Every fuzz lane loads it (`type/typeFuzzHarness.ts`, `roundtrip/roundtripHarness.ts`,
`binary/binarySizeFloors.test.ts`, `jsonschema/jsonSchemaFuzz.integration.test.ts`).
It is the single largest hand-written copy in the harness and the carve-out does
not mention it at all.

## Direction

Investigate and decide per item; they do not share a fix.

- **Structural brands** — most likely outcome is to keep them but fold them into
  `FUZZ_FORMAT_PREAMBLE` (or a sibling constant) so they sit under a declared
  exception with a stated rationale, rather than inline in the renderer.
- **`i18nModel.ts`** — check whether the overlay mechanism `srcOverlay.ts`
  already provides can reach these fixtures. If it can, import. If the temp-dir
  constraint is real, at least add a pinned test asserting the inline spelling
  still equals `TF.String<{minLength: 2}>` by structural id, so drift fails
  loudly.
- **`RUNTYPES_DTS`** — the real question is whether it can be GENERATED from
  `src/` (or from the same source as `internal/testfixtures/runtypes.d.ts`)
  instead of hand-maintained. This is the one with real design weight; it may
  deserve its own spec once scoped.

Finally, rewrite the `srcOverlay.ts:14-18` paragraph to name every exception it
actually has.

## Done when

Each of the three has a recorded decision (import / generate / keep-with-pin),
the ones that can be de-duplicated are, and the carve-out comment matches
reality.

---

## Note (2026-08-08)

Sequencing: this shares its blocker with
[fuzz-retire-per-format-aliases](fuzz-retire-per-format-aliases.md) — the type
lanes do not carry the `src/` overlay and `type/tsValidate.ts` cannot resolve a
relative `./src/...` import, so nothing here can be replaced by a real import
until that is fixed. See that todo's blocker section; do it once, for both.

`RUNTYPES_DTS` is the exception: it is a `declare module` stand-in rather than a
relative import, so it is blocked on nothing here — only on deciding whether it
can be GENERATED from `src/` (or from the same source as
`internal/testfixtures/runtypes.d.ts`). That question is worth splitting into its
own spec before anyone starts; it is the largest single duplication in the
harness and the only one whose fix is a codegen design.
