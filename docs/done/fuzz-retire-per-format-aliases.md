---
type: chore
spec: full-plan
status: done
created: 2026-08-08
completed: 2026-08-08
---

# Retire the per-format `Fz*` aliases by moving the id-convergence leg out of the fuzz lane

Split out of the [fuzz-followups audit](fuzz-followups.md) (2026-08-08).

## Problem

`FUZZ_FORMAT_PREAMBLE`
([typeGen.ts:323-351](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts)) is
18 declarations in two unequal tiers. Tier (a) — `FzTF`, `FzNot`, `FzString`,
`FzNumber` — restates the raw sentinel encoding the Go scanner reads, and is a
genuinely independent oracle. Tier (b) is 14 per-format aliases restating the
result of `PresetFormat<Tag, DEFAULT_X_PARAMS, {}>`, **eleven of which carry a
full transcribed regex source**, four of those multi-kilobyte RFC 3986 / 3987
grammars.

Tier (b) exists to serve one assertion in the json-schema lane:

```ts
getRunTypeId<FzUri>() === getRunTypeId(jsonSchemaOf({type: 'string', format: 'uri'}));
```

That assertion is **not a fuzz property**. The format keyword set is a 19-row
lookup table (`BrandBySchemaFormat`,
[fromJsonSchema.ts:343-371](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts)),
so every seed re-runs the same handful of comparisons. Sampling only beats
enumeration when the space is too big to enumerate.

It is already enumerated, twice, and both versions are **stronger** because they
use the shipped brands rather than a hand-copy that cannot fail when the shipped
brand changes:

- `test/suites/id-integrity/jsonSchema.test.ts` — 24 live string-format
  convergence cases, covering 16 of the 19 `BrandBySchemaFormat` rows.
- `test/suites/json-schema-define/loweringTable.test.ts:170-190` — 53
  `getRunTypeId` assertions on the format channel.
- `test/features/formatLengthOverrides.test.ts` — 10 cases over the
  `PresetFormat` / `FormatDefaults` merge itself.

Evidence the hand-copy is the weaker oracle: `FzJson`'s `mockSamples` pool has
already drifted from the shipped `DEFAULT_JSON_CONTENT_PARAMS` (6 samples vs 7,
different content) with nothing failing.

## What the fuzz lane must KEEP

The compositional half, which is genuinely unbounded and which no enumerated
suite covers: that a format leaf and its type-first spelling still converge when
**composed** — buried at arbitrary depth under nested objects, unions,
optionality, tuples, `contains` / `patternProperties` / `propertyNames`, `$defs`
/ `$ref`, and negation. That needs leaves already known to be equivalent, not
per-format aliases.

## Plan

1. Close the enumerated-suite gaps first, so nothing is lost when the fuzz leg
   goes: **there is no id-convergence case for `format: 'email'`, `'idn-email'`
   or `'regex'`** (3 of the 19 rows). `email` in particular is recorded as
   `'not-supported'` in `format-validation/StringFormat.ts:2340,2368` because the
   keyword lowers to `EmailAddress`, not `TF.Email` — add the case against the
   brand it actually lowers to.
2. Thin `FORMAT_LEAVES` ([typeGen.ts:131-308](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts))
   to one or two representative leaves. Mind the density comments at `:148-152`
   and `:279-283`: the roster exists partly to keep the negation lanes' rejection
   sampling viable, so whatever survives must keep a dense complement.
3. Delete the 14 tier-(b) aliases and the four multi-kilobyte regex
   transcriptions with them. Keep tier (a).
4. Rewrite the `srcOverlay.ts:14-18` carve-out paragraph: it should scope the
   exception to tier (a) and stop claiming there is only one exception (see
   [fuzz-undocumented-type-duplication](fuzz-undocumented-type-duplication.md)).

## Out of scope

The other three duplications (structural brands, `i18nModel.ts`, `RUNTYPES_DTS`)
— they have their own todo.

## Done when

The json-schema fuzz lane still checks composed convergence and no longer checks
per-format convergence; tier (b) is gone; `email` / `idn-email` / `regex` have
enumerated id-convergence cases; `pnpm rtx core fuzz jsonschema` and the full
suite are green.

---

## Progress (2026-08-08) — step 1 shipped, steps 2-4 still open

Landed with the [fuzz-followups](fuzz-followups.md) work:

- **Step 1 is done.** `test/features/schemaFormatKeywordConvergence.test.ts` now
  pins all **19** `BrandBySchemaFormat` rows, including the three that had no
  id-convergence case anywhere (`email`, `idn-email`, `regex`), plus negative
  cases for the two rows whose brand name deliberately differs from the keyword
  (`hostname` is not `Domain`, `uri` is not `Url`). The enumerated coverage the
  fuzz lane would lean on therefore exists now.
- **The email leaf was not just duplicated, it was WRONG.** The json-schema soak
  reported 7 id mismatches in 845 types, every one carrying that leaf: it
  claimed `format: 'email'` on the schema side while the type-first side was a
  hand-rolled pattern brand, and the door lowers that keyword to `EmailAddress`.
  It is now spelled as the `pattern` keyword it actually is (leaf renamed
  `emailish`, `FzEmail` retyped to `stringFormat` with `flags: 'u'` to match the
  door's unicode-mode pattern compile). A 90s soak at `RT_FUZZ_SEED=1` is clean.

  This is the concrete proof the todo was arguing for in the abstract: a
  hand-copy that drifts does not fail loudly, it fails as a mystery id mismatch
  845 types deep.

## Blocker found while scoping steps 2-4

Deleting the aliases means the leaves must come from the shipped brands, and
that needs the real `src/` reachable from BOTH consumers of the preamble. Only
one of them has it today:

- The **json-schema lane** already puts the whole `src/` tree in its resolver
  overlay (`SRC_OVERLAY`), so it could import `./src/formats/string/stringFormats.ts`
  right now.
- The **type lanes** do not: `type/typeFuzzHarness.ts:158` calls `setSources`
  with `{'runtypes.d.ts': RUNTYPES_DTS, [FIXTURE]: source}` only. Adding the
  overlay there puts 71 extra files through every compile in the lane that is
  already the slowest, so it needs measuring before it is assumed cheap.
- **`type/tsValidate.ts` is the harder half.** Its virtual file is `/__fuzz_typecheck__.ts`
  at the filesystem ROOT, so a relative `./src/...` import would resolve to
  `/src/...` and fail. Every format-bearing type would then typecheck as invalid,
  and the TS-validity gate would silently suppress its violations — the exact
  failure mode [fuzz-frozen-seeds-and-silent-gates](fuzz-frozen-seeds-and-silent-gates.md)
  just put a ceiling on (so it would now fail loudly rather than hide, but it
  would still fail). The fix is to anchor that virtual file at the real package
  root so relative imports resolve to the files on disk — small, but it must
  land first.

So the remaining order is: anchor `tsValidate`'s virtual file → measure the
overlay cost in the type lanes → thin `FORMAT_LEAVES` → delete tier (b) → rewrite
the `srcOverlay.ts` carve-out paragraph.

---

## Shipped (2026-08-08) — steps 2-4 done, by a simpler route than planned

The blocker above assumed the surviving leaves would need the SHIPPED brands
imported into the fixtures. They do not: every survivor is spelled through the
four tier-(a) aliases, so no `src/` overlay in the type lanes and no
`tsValidate` re-anchoring was ever required. The blocker section stands as the
analysis of the road not taken.

What landed:

- **`FORMAT_LEAVES` is thinned to six leaves** (`emailish`, `minLen50`,
  `maxLen8`, `patternA`, `integer`, `min0max100`), all admitted under a new
  ADMISSION RULE documented on `FormatLeafName`: a leaf is admitted only when
  its two spellings are mechanically the same document (keyword name = param
  name, or both sides read one shared constant). Anything needing a
  hand-maintained mapping — the named formats, the content keywords — is
  enumerable and lives in the enumerated suites.
- **Tier (b) is gone**: all 14 per-format aliases deleted, the four
  multi-kilobyte RFC 3986/3987 transcriptions with them. The preamble is now
  four content-free sentinel-encoding lines (`FzTF` / `FzNot` / `FzString` /
  `FzNumber`) — nothing left that can drift.
- **The enumerated side was completed first** (step 1 earlier, plus in this
  change): `negatedFormatMockSoundness.test.ts` now pins the `date` / `time` /
  `dateTime` fallback arms too, so EVERY runtime named-format test in
  `negationMatch.ts` has an enumerated soundness pin — the named-format
  coverage the fuzz roster used to sample is now enumerated in full.
- **The `srcOverlay.ts` carve-out paragraph is rewritten** to list all four
  actual exceptions (tier-(a) preamble, the structural sentinel spellings in
  `renderType`, `i18nModel`'s inline spelling, `RUNTYPES_DTS`) — see
  [fuzz-undocumented-type-duplication](fuzz-undocumented-type-duplication.md)
  for the other three.

---

## Superseded (2026-08-08, same day) — imports instead of thinning

On review, the thinning was rejected: generation must COVER every format
feature (each feature maps to a type, and the random generator must be able to
reach all of them), and the way to avoid duplication is not to shrink the
roster but to IMPORT the shipped brands. So the original plan's road not taken
was taken after all:

- `type/tsValidate.ts` anchors its virtual file at the real package root, and
  the type / roundtrip / binary harnesses put the whole `src/` tree in the
  resolver overlay — both halves of the blocker above, implemented. Measured
  cost: no meaningful lane slowdown (both type-lane batches finish in ~22s of
  test time).
- The roster is BIGGER than it ever was: all 19 `BrandBySchemaFormat` keyword
  rows (adding `email` — now correctly spelled as `TF.EmailAddress` —
  `idn-email`, `date`, `time`, `date-time`, `idn-hostname`, `ipv4`, `ipv6`,
  `regex`), both content keywords, and the six param leaves.
- Every `tsText` is a `TF.*` reference imported from
  `./src/formats/index.ts` (plus the shipped `OneOf` combinator, and the
  shipped `FormattedArray` / `FormattedObject` wrappers for the structural
  decorations). ZERO restated brand encodings remain in the resolver-lane
  fixtures — the per-format aliases stay retired, which is what this todo
  asked for; only the delivery route changed.
- The scratch-dir lanes (enrich / typemod), whose temp-dir fixtures cannot
  import, draw only `SCRATCH_FORMAT_LEAVES` (param brands) spelled by a local
  import-free `TF` namespace, pinned against the shipped encodings by
  `scratchFormatPreamble.test.ts`.
