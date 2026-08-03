---
type: feature
spec: full-plan
status: in-progress
created: 2026-08-03
---

# Keyword-first type formats: JSON Schema param aliases, absorb the schema door's bridge types

## Implementation status (2026-08-03)

Landed on `feature/json-schema-keyword-first-formats` (all commits verified
against the full Go + JS suites):

- **DONE — mockSamples out of the typeID** (`d0b2271`). Samples no longer fold
  into the format id; same-shape formats differing only in sample pools dedup
  onto one entry. Cross-site sample-pool conflict diagnostic deferred as
  [format-sample-conflict-diagnostic.md](format-sample-conflict-diagnostic.md).
- **DONE — the unified collection surface** (`359bcfe`), the core: every
  array/object keyword rides one params bag on `RT.array` / `RT.object` /
  `RT.record` and the `FormattedArray` / `FormattedObject` types; the five old
  builders + wrapper types are gone; the internal format names are
  `formattedArray` / `formattedObject`.
- **DONE — bound-keyword aliases** (`8c0b738`): `minimum` / `maximum` /
  `exclusiveMinimum` / `exclusiveMaximum` accepted on numeric / bigint / date /
  Temporal formats, canonicalised to `min` / `max` / `gt` / `lt` in the Go
  scanner (one place; emitters unchanged). Folded in the `bigintParamsMatch`
  gt/lt/multipleOf fix and `UUIDParams.version: 'any'`.
- **DONE — value-first content formats** (`fa15973`): `TF.base64/base32/base16`
  (contentEncoding) + `TF.jsonContent()` / `TF.jsonContentBase64()`
  (contentMediaType), each converging with the door. NOTE: this keeps
  `jsonContent` as a registered Go format — the fuller "collapse the jsonContent
  format into StringParams + move its JSON-parse check into the stringFormat
  emitter" is still open (below).
- **DONE — doc references** (`8198acd`): ARCHITECTURE / ROADMAP / the JSON Schema
  guide table point at the new surface.

**Still open (this spec stays here until done):**

- **Collapse the `jsonContent` FORMAT** into `StringParams`
  (`contentMediaType` / `contentEncoding` as string params; delete
  `jsoncontent.go` and fold its parse check into the stringFormat emitter;
  drop the `jsonContent` `FormatName` + its `SchemaStoryByFormatName` row;
  drop the door's `{json: true}` discriminator). Riskiest Go surgery; the
  value-first authoring gap is already closed by `TF.jsonContent()`.
- **Generic `Email` / `Domain` / `Url`** on the `IP` template (widen
  `UrlParams` with maxLength/minLength; re-spell variants through the generic;
  delete `RebrandWithLengths` / `FormatWithSiblings` / `VariableWidthFormat`).
- **`SchemaLoweringByKeyword`** typechecked contract + totality assert, the
  website 4-column keyword table + a compiled examples file.
- Then reconcile + `git mv` this spec into `docs/done/`.

## Original plan follows

Investigated 2026-08-03 (full sweep: formats surface, json-schema module, Go
readers/mirrors, enrichment, docs, benchmarks). Three PRs (tiers). Decided
with the user (2026-08-03): **keyword spellings become ALIASES, not renames**;
**short names stay canonical** (what Go reads, what ids hash, what errors
show); aliasing is **uniform** (dates + Temporal included, via the shared
bounds mixin).

## Problem

The schema door
([fromJsonSchema.ts](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts))
privately re-implements what the formats surface should own:

- **Vocabulary gap.** Format bounds are `min`/`max`/`gt`/`lt` while the
  keywords are `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum` — the
  ONLY spelling mismatches (everything else already matches:
  `minLength`/`maxLength`/`pattern`/`multipleOf`/`minItems`/`maxItems`/
  `uniqueItems`/`minProperties`/`maxProperties`/`minContains`/`maxContains`).
  Today only the door can accept keyword spellings, via a door-private remap
  (`NumberKeywordRemap` fromJsonSchema.ts:348-354 + `NumberParamsFrom`
  :355-357); a user writing `TF.Number<{minimum: 0}>` gets a compile error,
  and the toJsonSchema prototype hand-rolls the inverse table
  (jsonSchemaOutput.proto.ts:195-204). Migrating between runtypes and JSON
  Schema means learning both vocabularies.
- **Three capabilities can ONLY be authored as a JSON Schema literal.** They
  validate, mock, and negate fine once created, but no TypeScript type or
  builder can spell them — so runtypes users cannot write them at all, and
  schema users cannot migrate off them. Tier 2 closes each gap:
  - JSON-parseable string content (`contentMediaType: 'application/json'`):
    the `jsonContent` format exists end-to-end (Go emitter jsoncontent.go,
    mocking, negation) yet has no `JsonContent` type, no params interface,
    and no `TF.jsonContent()` builder → Tier 2 adds all three.
  - base64/base32/base16 strings (`contentEncoding`): the validation regexes
    and mock pools are private literals inside fromJsonSchema.ts (:329-345)
    instead of registered named patterns → Tier 2 registers them and adds
    `Base64`/`Base32`/`Base16` types + builders.
  - Length limits on named string brands: `{format: 'email', maxLength: 100}`
    works in a schema, but `Email<{maxLength: 100}>` /
    `TF.email({maxLength: 100})` do not compile (the aliases are non-generic;
    their params interfaces exist unused), forcing the door into brand
    surgery (`RebrandWithLengths` :317-321) → Tier 2 makes the aliases
    generic and the builders take params, then deletes the surgery.
- **Hand-maintained twins.** The door re-spells
  `StructuralBrand`/`Contains`/`PatternProperties`/`PropertyNames` locally
  (:402, :639, :540, :551) with no compile-time drift check against
  [structural.ts](../../packages/ts-runtypes/src/formats/structural.ts).

Two latent bugs found during investigation are folded in (this work touches
those exact lines): `bigintParamsMatch` lacks `gt`/`lt`/`multipleOf` arms so a
bigint format under `Not<>` hits the default throw (negationMatch.ts:316-335),
and the `UUID` alias passes `{version: 'any'}` which its own `UUIDParams`
(stringFormats.ts:177) does not admit.

## Design invariants (canonized)

1. **Metadata only.** TypeScript never carries or enforces format constraints
   during typechecking. Format params ride as optional readonly sentinel
   props (`__rtFormatName`/`__rtFormatParams`: `TypeFormat`
   typeFormat.ts:50-62 for primitives, `StructuralBrand` structural.ts:27-30
   for collections), lifted by the Go scanner (typeid/formats.go:103-137)
   into a canonicalised annotation map (protocol.go:362-370) that drives
   emitted validation, serialization, and mocking. The mechanism exists for
   primitives AND collections; this spec extends coverage and vocabulary — it
   invents no new mechanism.
2. **Aliases normalize at intake; canon is short.** Every params intake (TF
   type alias, TF/RT builder, schema door) normalizes alias spellings into
   the canonical short keys BEFORE params land in `__rtFormatParams`. So
   `TF.Number<{minimum: 0}>` ≡ `TF.Number<{min: 0}>` — one annotation, one
   structural id, one cached factory. Downstream (Go readers, mocking,
   negation, enrichment `rt$errors` keys, error `formatPath`) sees ONLY
   canonical keys and needs zero changes. Corollary: the alias work (Tier 1)
   causes NO id churn — existing types keep their ids; new alias spellings
   converge onto them. The spec's only deliberate id breaks are Tier 2's
   `{json: true}` drop and Tier 3's structural format-name rename, both
   called out where they happen.

## The keyword mapping table (the contract)

Every JSON Schema keyword the door accepts maps to four authoring forms, or
carries an explicit no-mapping reason: **(T1)** primitive type form
`TF.Number<{minimum: 0}>` · **(B1)** primitive builder `TF.number({minimum: 0})`
· **(T2)** collection type wrapper `FormattedObject<I, P>` /
`FormattedArray<A, P>` · **(B2)** collection builder
`RT.object({...}, params, id?)`. Cells: exists / NEW (tier) / no mapping
(reason).

**String assertions** (T2/B2: no mapping)

| keyword | T1 | B1 |
| --- | --- | --- |
| `minLength`/`maxLength` | `String<{minLength: N}>` exists; on named brands `Email<{maxLength: N}>` NEW (T2) | `TF.string(...)` exists; `TF.email({maxLength: N})` NEW (T2) |
| `pattern` | exists; bare-string shorthand NEW (T1) | same |
| `format` (email/uuid/date/time/date-time/hostname/ipv4/ipv6/uri) | aliases exist; generic `Email<P>`/`Domain<P>`/`Url<P>` NEW (T2) | presets exist; email/domain/url params overloads NEW (T2) |
| `contentEncoding` (base64/base32/base16) | `Base64`/`Base32`/`Base16` NEW (T2) | `TF.base64()` etc. NEW (T2) |
| `contentMediaType: application/json` | `JsonContent<P>` NEW (T2) | `TF.jsonContent({decode?})` NEW (T2) |

**Numeric assertions** (T2/B2: no mapping)

| keyword | T1 | B1 |
| --- | --- | --- |
| `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum` | ALIAS (T1): accepted on Number/BigInt AND the shared date/Temporal `MinMax` mixin, normalized to canonical `min`/`max`/`gt`/`lt` — one id either spelling | same aliases in `TF.number`/`bigInt`/`date`/`stringDate`/temporal builders |
| `multipleOf` | exists (already keyword-named) | exists |
| `type: 'integer'` | `Number<{integer: true}>` / `Integer` exist | `TF.integer()` exists |

**Object applicators** (T1/B1: no mapping)

| keyword | T2 | B2 |
| --- | --- | --- |
| `properties`/`required`/`additionalProperties: <schema>` | native object literal / `& Record<string, A>` | `RT.object`/`RT.optional`/`RT.record` exist |
| `additionalProperties: false`, `unevaluatedProperties` | schema-door only (derived `closed`/`closedPatterns`; see Decisions) | no mapping — `createHasUnknownKeysFn`/clone-exact-shape |
| `minProperties`/`maxProperties` | `FormattedObject<I, P>` (renamed T3) | `RT.object(cfg, params, id?)` + `RT.record(v, params, id?)` NEW (T3) |
| `patternProperties` | `PatternProperties<B, M>` exists | `RT.patternProperties` exists |
| `propertyNames` | `PropertyNames<B, K>` exists; `propertyNames: false` (never-key) NEW (T2) | `RT.propertyNames(inner, RT.never())` NEW (T2) |
| `dependentRequired`/`dependentSchemas` | no mapping (door desugars to unions; spell the union directly) | — |

**Array applicators** (T1/B1: no mapping)

| keyword | T2 | B2 |
| --- | --- | --- |
| `items`/`prefixItems` | native arrays/tuples | `RT.array`/`RT.tuple` exist |
| `minItems` | tuple arity native; `FormattedArray` for non-tuple bound (renamed T3) | `RT.array(item, params, id?)` NEW (T3) |
| `maxItems`/`uniqueItems` | `FormattedArray<A, P>` (renamed T3) | `RT.array(item, params, id?)` NEW (T3); tuple bounds spell type-first via `FormattedArray<Tup, P>` |
| `contains`/`minContains`/`maxContains` | `Contains<B, C, Min, Max>` exists | `RT.contains` exists |
| `unevaluatedItems` | no mapping (door lowers to maxItems over merged prefixes) | — |

**Value-scoped / combinators / references / annotations**

| keyword | mapping |
| --- | --- |
| `enum` / `const` | literal unions / `RT.union` + `RT.literal` exist. `allowedValues` keeps its name (options bag: ignoreCase/errorMessage/mockSamples; toJsonSchema maps `.val` → `enum`) |
| `anyOf`/`allOf`/`oneOf` | union/intersection native; `RT.union`/`RT.anyOf`/`RT.intersection`/`OneOf<[...]>`/`RT.oneOf` exist |
| `not` | format-scoped `Not<F>` / `RT.not` exist; full-schema negation stays door-only (`__rtNot`) — partial |
| `if`/`then`/`else` | no mapping (desugars to `(If ∧ Then) ∨ (¬If ∧ Else)`; spell the union) |
| `$ref`/`$defs`/`$anchor`/`$dynamicAnchor`/`$dynamicRef` | native type references / `RT.circular` + `RT.self` exist |
| `readOnly` (property) | native `readonly` modifier / `RT.propMod({readonly: true}, f)` (compose.ts:444-448) — exists, no new work |
| `title`/`description` | no format mapping — RunTypes-native home is FriendlyText `rt$label` (pointer row) |
| `default`/`examples`/`deprecated`/`writeOnly`/`$comment`/`$schema`/`$id`/`$vocabulary` | no mapping (annotations; intent-drop warnings are [json-schema-dropped-intent-warnings.md](json-schema-dropped-intent-warnings.md)) |

**Params with NO keyword counterpart stay unchanged**: `length`, `integer`,
`float`, `isCurrency`, `allowedChars`/`disallowedChars`,
`allowedValues`/`disallowedValues`, `mockSamples`,
`trim`/`lowercase`/`uppercase`/`capitalize`/`replace`/`replaceAll`, `version`,
`allowPort`/`allowLocalHost`, `minParts`/`maxParts`, `names`/`tld`,
`localPart`, `domain`, `splitChar`, `decode`, `format` (date layout).

## Decisions (decided)

- **Aliases, not renames; short canonical** (user-decided 2026-08-03). A
  shared type-level normalizer — working name `CanonicalBounds<P>` — maps
  `minimum→min`, `maximum→max`, `exclusiveMinimum→gt`, `exclusiveMaximum→lt`
  and is applied at every intake: the TF aliases (`Number<P>`, `BigInt<P>`,
  `StringDate/StringTime/StringDateTime<P>`, `Date<P>`, Temporal aliases),
  the value-first builders (brand type AND the runtime carrier params object,
  so no alias key ever reaches an annotation), and the schema door (whose
  `NumberParamsFrom` becomes the pinned local twin of the SAME normalizer —
  the remap stops being a door-private invention and becomes the public
  contract). Params interfaces gain the optional alias keys with JSDoc
  marking them aliases. **Conflict rule**: both spellings of the same bound
  in one params object is a compile error (normalizer yields `never` for that
  key; surfaces at the call site via the existing `ExactParams` guard).
  Uniform across number/bigint/date/time/dateTime/nativeDate/Temporal via the
  shared `MinMax` mixin (dateTimeParams.ts:36).
- **Bare-string pattern shorthand**: `pattern: '^a'` ≡
  `{source: '^a', flags: ''}` — the same normalize-at-intake pattern, applied
  at the `String<P>` alias, `TF.string`, and the door's `StringParamsFrom`
  (:231-235, kept local per the extract-region policy, pinned).
  `StringParams.pattern` widens to `PatternParam | string`.
- **`closed`/`closedPatterns` stay door-owned** (status quo): the
  structural.ts:9-15 rationale is correct — a hand-authored allowed-key list
  drifting from the shape is a silent always-reject footgun, and the emitter
  documents `closed` as never hand-authored (objectformat.go:41-44). A
  derived `RT.closed(inner)` builder is a possible follow-up, not built here.
- **Extract-region policy — twin-with-drift-pins**: the
  `#region jsonschema-extract` (:34-:1529) is sliced verbatim by
  [jsonSchemaHarness.ts](../../packages/ts-runtypes/test/types/jsonSchemaHarness.ts):28-36
  into a standalone tsc program (budget test), so the region stays
  self-contained. Local twins are pinned by compile-time equality asserts
  BELOW `#endregion` (imports free there; precedent:
  `AssertSchemaStoryTotality` :1568): the bounds normalizer twin,
  `StructuralFormat`≡`StructuralBrand`, `ContainsPart`≡`Contains`,
  `PatternPropsPart`≡`PatternProperties`, `PropNamesPart`≡`PropertyNames`,
  `StringFormat`/`NumberFormat`≡`TypeFormat` spellings, `Flatten` twins, plus
  T2 additions (`JsonContentFormat`≡`JsonContent`, `ContentEncodingPattern`
  fields ≡ the registered pattern constants, samples included). Generic twins
  pin 2-3 representative instantiations. Rejected: import-with-stand-ins
  (stand-ins duplicate the shape in an UNCHECKED test string — harness :43-64
  even simplifies Email params to `{}` today).
- **`jsonContent`'s `{json: true}` discriminator: DROP** — read by nothing
  (verified: jsoncontent.go reads only `decode`; mock reads `mockSamples`);
  the format NAME discriminates. `TF.jsonContent()` must bake the door's
  exact default `mockSamples` pools so the two doors converge on one id.
  (Schema-door jsonContent ids change — a deliberate id break; pre-1.0,
  called out in the CHANGELOG.)
- **Column-4: replace, don't wrap** (user-decided 2026-08-03).
  `RT.arrayFormat` and `RT.objectFormat` are REMOVED from the public surface;
  `RT.object(cfg, params?, id?)`, `RT.array(item, params?, id?)`, and
  `RT.record(..., params?, id?)` carry the trailing optional format-params
  argument and build the SAME internal carrier nodes the wrappers build
  today (structural.ts:90, :101). The naming renames ALL the way down
  (user-decided 2026-08-03): types `ArrayFormat`→`FormattedArray` /
  `ObjectFormat`→`FormattedObject`, params bags →`FormattedArrayParams`/
  `FormattedObjectParams`, and the internal format-name strings
  `arrayFormat`/`objectFormat`→`formattedArray`/`formattedObject` — through
  the `__rtFormatName` spellings (`StructuralBrand` structural.ts:27-30 +
  the door's pinned twin), the Go structural emitters + registry
  (arrayformat.go:30-31, objectformat.go:29-31), the regenerated catalog
  (`pnpm rtx core codegen typeformats`), the TS dispatch tables
  (mockType.ts:349-356, structuralFormat.ts:40-67, negationMatch.ts), and
  the `SchemaStoryByFormatName` rows. Two visible consequences, accepted:
  error objects' `format.name` starts matching the public type names, and
  every array/object-formatted type's id changes (pre-1.0). Scalar internals
  (`stringFormat`/`numberFormat`/`bigintFormat`) keep their names — their
  public aliases (`String`/`Number`/`BigInt`) never carried the suffix.
  Disambiguation = the runtime arg-sniffing `record`/`tuple` already do
  (compose.ts:295-302). `RT.tuple`: no trailing params (its 4-overload
  positional sniffing can't absorb a fifth trailing kind; tuple bounds spell
  type-first via `FormattedArray<Tup, P>`). `RT.map`/`RT.set`: no params (no
  Go structural emitter registers under Map/Set kinds — objectformat.go:29-31,
  arrayformat.go:30-31; params would be dead weight). Accepted loss:
  value-first format annotation of a PRE-BUILT object runtype value
  (today's `RT.objectFormat(someRt, p)`) has no builder replacement — spell
  it type-first.
- **Structural exports**: the wrapper TYPES (`FormattedArray`/
  `FormattedObject`, plus `Contains`/`PatternProperties`/`PropertyNames`
  unchanged) re-export from `formats/index.ts` (TF surface); the collection
  builders stay on the RT surface per the composition rationale
  (schema/index.ts:18-22).
- **Table home — both, typecheck-enforced**: (1) in-source
  `SchemaLoweringByKeyword` contract beside `SchemaStoryByFormatName`
  (:1541+), one row per `keyof JsonSchemaInput` (+ `$id`/`$vocabulary`) with a
  two-direction totality assert — a newly accepted keyword breaks the build
  until its row is decided; (2) the user-facing 4-column table as a new
  section of 02.json-schema.md whose non-trivial cells live in a compiled
  examples file under [packages/examples/src/](../../packages/examples/src/)
  (root typecheck compiles the markdown's claims).

## Plan

**Tier 1 (PR1) — alias vocabulary + latent-bug fixes.** All TypeScript, all
in `packages/ts-runtypes/src/`; **zero Go changes, zero enrichment
migration, zero id churn** (invariant 2 — the whole point of short-canonical).

- The shared `CanonicalBounds<P>` normalizer + alias keys on `NumberParams`
  (numberFormats.ts:20), `BigIntParams` (bigintFormats.ts:20), `MinMax`
  (dateTimeParams.ts:36; inheritors stringDateTimeFormats.ts:27/40/51,
  dateFormats.ts:20, temporalFormats.ts:68-96 pick it up for free).
- Apply at intakes: the format type aliases, the `TF` builders
  (scalars.ts:44-152, stringFormats.ts date builders :392-434, temporal
  factory :155-165 — brand type + runtime carrier params), and the door
  (`NumberParamsFrom` :355-357 reframed as the pinned normalizer twin;
  `NumberKeywordRemap` :348-354 folds into it).
- Bare-string pattern shorthand (same intake points for string params).
- Latent-bug fixes: add `gt`/`lt`/`multipleOf` arms to `bigintParamsMatch`
  (negationMatch.ts:316-335); widen `UUIDParams.version` to
  `'4' | '7' | 'any'` (stringFormats.ts:177).
- Explicitly UNCHANGED (assert in review): all Go param readers and
  enrichment tables (numberformat.go, bigintformat.go, bounds.go,
  boundcodegen.go:91-94, temporalFormat.go, classify.go:16-23,
  merge.go:391-401), `formatPath` spellings, committed FriendlyText maps,
  `mockMetaKeys`/`mockReservedKeys` (their `min`/`max` are MockData
  pool-range keys — different vocabulary, never touched), generated catalogs
  (`pnpm rtx core codegen all --check` must pass with NO diffs).
- FROZEN (do not touch): published subpaths, bench form labels
  (`ts-go (jsonSchema)`), serialization column keys
  ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)
  R1/R3).

**Tier 2 (PR2) — absorption + door dedup.**

- `formats/string/`: `JsonContentParams` (`decode?: 'base64'` + string
  sibling params) + `JsonContent<P>` + `TF.jsonContent()` (format name
  already registered — typeFormats.generated.ts:41; Go emitter, mock,
  negation all exist: ZERO Go changes). Drop `{json: true}` door-side.
- `string-patterns.ts`: register `BASE64_PATTERN`/`BASE32_PATTERN`/
  `BASE16_PATTERN` with the door's exact sources + sample pools (:329-345);
  `Base64`/`Base32`/`Base16` aliases + preset builders.
- Generic named brands: `Email<P extends EmailParams = ...>`, `Domain<P>`,
  `Url<P>` with **Omit-merge defaults**
  (`TypeFormat<string, Name, Omit<DEFAULTS, keyof P> & P>` — supplied lengths
  must override the RFC defaults exactly as `RebrandWithLengths` does today,
  or ids diverge); params overloads on `email`/`domain`/`url` builders
  (precedent: `alpha` stringFormats.ts:324-333). Then DELETE
  `RebrandWithLengths` + `FormatWithSiblings` + `VariableWidthFormat`
  (:307-321); harness stand-ins become generic one-liners.
- `propertyNames: false` value-first: verify/fix
  `RT.propertyNames(inner, RT.never())` end-to-end (converges with
  `PropNamesPart`'s false branch :551-555).
- Drift-pin block below `#endregion` per the Decisions.
- No new `FormatName` rows ⇒ `SchemaStoryByFormatName` needs only story-text
  touch-ups.

**Tier 3 (PR3) — collections surface + shipped table + docs.** Trailing
params on object/array/record (compose.ts:471-475, :56-58, :286-299) with
`RT.arrayFormat`/`RT.objectFormat` removed in the same PR (migrate their
test/doc/e2e usages to the new forms); the `Formatted*` renames all the way
down per the Decisions (types, params bags, internal format names incl. the
two Go emitter strings + `pnpm rtx core codegen typeformats` regen + door
twins); TF-side type re-exports;
`SchemaLoweringByKeyword` + totality assert; 02.json-schema.md table section
+ compiled examples; ARCHITECTURE (its :309-314 names the old spellings) +
ROADMAP updates.

**Sequencing**: land
[rename-value-first-schema-to-type-builders.md](rename-value-first-schema-to-type-builders.md)
BEFORE Tier 3 if possible (write Tier 3 against `src/builders/`; if not yet
landed, the same edits apply at `src/schema/` and rebase mechanically).
Tiers 1-2 touch zero Go; Tier 3's only Go edits are the two structural
format-name strings + catalog regen — no resolver or protocol logic changes
(the annotation name rides the wire as an opaque string).

## Tests

- **Tier 1** — new: (1) alias triple convergence, one per family
  (`Number<{min: 0}>` ≡ `Number<{minimum: 0}>` ≡ `TF.number({minimum: 0})` —
  one id; same shape for bigint, stringDate, nativeDate, one temporal);
  (2) conflict compile errors (`{min: 0, minimum: 5}` rejected) as
  type-level expect-error cases; (3) bigint negation regression — a
  `Not<BigInt<{gt}>>`-shaped mock must sample, not throw; (4) `UUIDParams`
  admits `'any'`; (5) pattern-shorthand triple convergence
  (`String<{pattern: 'x'}>` ≡ `String<{pattern: {source: 'x', flags: ''}}>` ≡
  `TF.string({pattern: 'x'})`). Changed: format-validation suites gain alias
  spellings alongside canonical rows; jsonSchema.compile.test.ts budget
  re-baselined if the normalizer twin shifts counts. Explicitly unchanged:
  enrich suites, Go tests, recovered-type rows (door output params were
  already canonical).
- **Tier 2** — new: jsonContent (validate/mock/negation/decode-base64),
  base64/32/16 presets, Email/Domain/Url length overrides — each with a
  **door-convergence id assertion** (schema literal via `runTypeFromJsonSchema`
  ≡ TF builder ≡ type-first alias — one id); drift-pin block compiles;
  harness stand-in + budget re-baseline; recovered-type rows updated (no
  `json: true`, direct alias spellings).
- **Tier 3** — convergence per collection form: `RT.object(cfg, p)`
  value-first ≡ type-first `FormattedObject<...>` — one id (same for
  array/record), pinning that the trailing-params carrier equals the old
  wrapper node; record 2/3/4-arg runtime disambiguation; the
  StructuralFormat suite migrated off the removed builders and onto the new
  format names (mock/negation dispatch under `formattedArray`/
  `formattedObject`); recovered-type rows updated for the renamed
  `__rtFormatName` spellings; `SchemaLoweringByKeyword` totality compiles;
  table examples compile under root typecheck.
- **Marker rule** (CLAUDE.md): the convergence tests pair static
  `getRunTypeId<T>()` and reflection `getRunTypeId(value)` shapes with a
  hash-equivalence assertion.
- All tiers: `pnpm test`, `go -C ts-go-runtypes test ./internal/...`,
  `pnpm rtx core codegen all --check`, lint/format.

## Docs

- 03.type-formats.md: document both bound spellings + which is canonical in
  plain reader terms (validation errors name the short form); new
  jsonContent/Base64 family + generic Email/Domain/Url params (T2);
  trailing-params spelling (T3).
- 02.json-schema.md: keyword-table section (T3); a migration note that TF
  params accept JSON Schema keyword spellings verbatim (T1);
  jsonContent/encoding rows point at the new TF surface (T2).
- packages/examples/src: alias spellings in one example + the new table
  examples file. index.md and ai-integration pages: untouched (no `rt$errors`
  key changes in this design).
- ARCHITECTURE.md: the two invariants (metadata-only; normalize-at-intake
  with short canon). ROADMAP.md: alignment shipped; round-trip hook.
- Website style rules apply (no em/en dashes, MDC/fence baselines,
  code-import preference).

## Fuzzing

No new lane in this spec. The existing
[jsonSchemaFuzz.integration.test.ts](../../packages/ts-runtypes/test/fuzz/jsonschema/jsonSchemaFuzz.integration.test.ts)
lane keeps running unchanged. Hook for later: once toJsonSchema is
productized, the table's no-mapping rows are exactly the round-trip fuzzer's
skip list — noted in ROADMAP, deferred with it. A cheap Tier 1 property worth
folding into an existing suite: for random bound bags, alias spelling ≡
canonical spelling id equality (the convergence oracle).

## Out of scope

Cross-referenced, not duplicated:
[json-schema-dropped-intent-warnings.md](json-schema-dropped-intent-warnings.md)
(silent keyword drops);
[json-schema-spec-conformance-gaps.md](json-schema-spec-conformance-gaps.md);
[json-schema-optional-sugar-corners.md](json-schema-optional-sugar-corners.md);
the schema→builders rename itself (sequencing only); productized
`toJsonSchema` + round-trip fuzzing (the prototype stays a prototype);
`RT.closed(inner)` derived closedness; Map/Set structural formats; renaming
`allowedValues` to `enum`; renaming ANY canonical param key (aliases only,
per the decision).

## Done when

- `TF.Number<{minimum: 0}>` / `TF.number({minimum: 0})` (and bigint/date/
  temporal equivalents) compile and hash-converge with their canonical
  spellings — the triple-convergence suites green, written in paired marker
  shapes; `{min, minimum}` conflicts are compile errors.
- `NumberKeywordRemap` no longer exists as a door-private table — the door's
  number lowering is the pinned twin of the public `CanonicalBounds`
  normalizer; the drift-pin block compiles.
- `git diff` for Tier 1 shows NO changes under `ts-go-runtypes/`, no
  regenerated catalogs (`pnpm rtx core codegen all --check` clean), no
  committed enrichment map edits.
- `TF.jsonContent()`, `TF.base64/base32/base16()`, generic
  `Email/Domain/Url`, `RT.propertyNames(x, RT.never())`,
  `RT.object/array/record(..., params)` exist; `RT.arrayFormat`/
  `RT.objectFormat` are gone from the public surface and `FormattedArray`/
  `FormattedObject` replace the old wrapper type names; every new cell has
  its door-convergence id test green.
- `SchemaLoweringByKeyword` totality compiles; the 02.json-schema.md table
  section exists with its examples file in the root typecheck.
- After Tier 3, `arrayFormat`/`objectFormat` appear nowhere outside
  `docs/done/` history — the internal names are `formattedArray`/
  `formattedObject` end-to-end and `pnpm rtx core codegen all --check` is
  clean after the regen.
- All gates green per tier; bench labels + subpaths byte-identical to
  pre-spec.

## Risks

1. **Normalizer instantiation cost** — `CanonicalBounds<P>` runs at every
   format type intake and inside the door's budget-tested region. Mitigation:
   keep it a single shallow mapped type with `as`-clause key remap (the exact
   shape the door's remap already uses today, so the budget is pre-paid
   there); re-baseline jsonSchema.compile.test.ts counts in-PR.
2. **Two spellings in the wild** — docs and error messages must not confuse
   readers (errors say `min`, code may say `minimum`). Mitigation: one plain
   sentence in 03.type-formats.md naming the canonical form; FriendlyText
   authors see only canonical keys (nothing changes for them).
3. **Extract-region integrity** — T2 edits inside the region can break the
   harness slice or the budget silently. Mitigation: drift pins in shipped
   source; stand-in edits limited to three generic one-liners; budget
   re-baseline reviewed in-PR.
4. **Collision with the schema→builders rename** — both touch compose.ts +
   the same guide pages. Mitigation: explicit sequencing above; T3 written
   against post-rename paths with a fallback note.
5. **Convergence regressions in T2** — the generic aliases must reproduce
   `RebrandWithLengths`'s Omit-merge exactly, and the jsonContent/encoding
   presets must bake the door's exact param literals (pools included), or the
   doors fork ids. Mitigation: merge semantics specified here (not left to
   the implementer); one door-convergence id test per new cell is a hard
   Done-when item.
