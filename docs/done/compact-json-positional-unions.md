---
type: feature
spec: full-plan
status: done (2026-10-11)
created: 2026-10-11
---

# Compact JSON writes unions positionally, with a free-value placeholder

## Problem

The `compact` JSON strategy writes a plain object as an array of its values, but an object inside a
union keeps every key name. Compact reuses the keyed flat-union encode: the union's object members merge
into one keyed object (`json_compact.go:123`, `json_compact_restore.go:126-131`, layout in
`union_flat_layout.go` `buildFlatLayout`). Measured on the mion benchmark model:

    type PaymentMethod =
      | {type: 'credit_card'; lastFourDigits: string; expiryMonth: number; expiryYear: number; brand: string}
      | {type: 'bank_account'; bankName: string; accountLastFour: string; routingNumber: string}
      | {type: 'paypal'; email: string};

Three of them encode to 246 bytes under compact, byte for byte the same as plain JSON.

A second, documented gap: a missing optional is written as `null`, so an optional typed `T | null`
cannot tell a present `null` from absent.

## Design

### 1. The merged object goes positional

The flat layout already merges every object member's props into one list (`layout.MergedProps`, first
appearance order). Under compact, that merged object is written as ONE positional array over
`MergedProps`, a missing prop holding its slot's placeholder. No member is picked on encode, so nothing
can be lost, discriminated or not (`{email} | {email; phone?}` keeps `phone`). Decode rebuilds the keyed
merged object from positions; validation picks the member as today.

    // PaymentMethod[] under compact: 164 bytes (246 today)
    [["credit_card","4242",12,2025,"visa",0,0,0,0],
     ["bank_account",0,null,null,0,"Chase","1234","021000021",0],
     ["paypal",0,null,null,0,0,0,0,"john.paypal@example.com"]]

- Same-name props with different types keep their `[subIdx, value]` sub-wrap inside the slot.
- A stripped-candidate prop (`HasStrippedCandidate`) writes the placeholder instead of `delete`.
- A union with an index-signature member keeps today's keyed form (`layout.hasIndexSignatureMember`);
  pinned by `union_flat_compact_test.go:135-163, 275-314`.

### 2. The wrapper only when needed

- Objects-only union: no wrapper. An array at the slot IS the merged object (this also drops today's
  `[-1, …]` on object unions carrying a Date or bigint).
- Objects plus members that are always plain scalars on the wire (`null`, string, number, boolean,
  string/number literal, enum, template literal): no wrapper. `{tag} | null` → `["x"]` / `null`.
  Sound because those members are JSON-identity and never arrays, so `Array.isArray(v)` is exclusive to
  the object arm and the atomic guards (`atomicEncodeDispatch`) read the same on the wire.
- Any other non-object member (array, tuple, bigint, `undefined`/`void`, `any`, `unknown`, `object`,
  intersection, any class): all-or-nothing wrapper as today, `[-1, positional]` / `[idx, value]`.
  Without it `{a: string} | string[]` would decode `["x"]` as a `string[]`.

### 3. The placeholder: the first value the slot can never hold

For every compact slot (plain object optionals, `nonEnumerable`-guarded props, merged union slots) a
missing value is written as the first of `0`, `null`, `false` that the slot's WIRE value can never be.

| Slot type | Placeholder |
|---|---|
| `string`, `Date`, `bigint`, nested object, array, `string \| null` | `0` |
| `number`, `1 \| 2`, numeric enum | `null` |
| `number \| null` | `false` |
| `any`, `unknown`, `number \| null \| boolean` | none free, see below |

- No free value, plain object optional: `null`, today's documented collapse (present `null` reads absent).
- No free value, merged union slot: `null` when no member declaring the prop REQUIRED can hold `null`;
  otherwise the whole union keeps today's keyed form.
- Side effect: `s?: string | null` now round-trips a present `null`.

## Plan

Paths under `ts-go-runtypes/internal/cachegen/typefunctions/` unless stated. Line numbers as of 2026-10-11.

**Wire classes, one visitor** (new `compact_placeholder.go`)
- `compactWireClasses(rt, ctx, visited)` → bitset `{number, null, boolean}` of what a slot's encoded
  value can be. One arm per `ReflectionKind` (visitor rule, `ts-go-runtypes/AGENTS.md`):
  Number/numeric literal/numeric or mixed enum → number (an enum with no values → all three);
  Null/Undefined/Void → null; Boolean/boolean literal → boolean;
  `any`/`unknown`/`object`/`{}`/Intersection/TypeParameter/Infer/Parameter/EnumMember → all three
  (conservative); String/TemplateLiteral/BigInt/string+bigint literals/Array/Tuple/ObjectLiteral/
  IndexSignature → none; Class → none except a named user class, which may carry a runtime serializer
  (all three); Union → OR of surviving members (`anyUnionMember`); Property/PropertySignature/
  TupleMember/Rest → recurse `.Child`. Non-data (`isStrippedUnionMember`) → none, checked once before
  the switch. An object literal reads its members through `objectMembers`. Cycle revisit → none (least
  fixpoint). No user override can change a compact slot: `overrideJsonEncoder` replaces the whole
  composite, a nested overridden type still encodes structurally.
- `firstFreePlaceholder(classes)` picks `0` / `null` / `false` per Design §3, answering `null` with
  ok=false when none is free (the plain-object collapse). `mergedSlotPlaceholder(mp, ctx)` adds the
  union rules: a sub-wrapped merged slot (`NeedsSubWrap`, >1 candidate) is an array on the wire → `0`.

**Layout** (`union_flat_layout.go`)
- `FlatLayout` (14-40): add `PositionalMerged bool`, set only by `buildCompactFlatLayout`.
- `FlatMergedProp` (66-82): add `Placeholder string` (empty when `Required`).
- `FlatPropCandidate.Optional` (84-92), read nowhere before: the dedup branch at :425-431 now ANDs it
  across the members sharing the candidate, so `!Optional` means "some declarer requires it".
- A union that falls back to the keyed form clears every `Placeholder`, so the keyed emit never reads one.

**Compact layout + wrapper rule** (`union_flat_compact.go:76-82`, `buildCompactFlatLayout`)

    layout := buildFlatLayout(rt, ctx)
    layout.PositionalMerged = len(layout.ObjectMembers) > 0 && !layout.hasIndexSignatureMember(ctx)
    for i := 0; layout.PositionalMerged && i < len(layout.MergedProps); i++ {
        layout.MergedProps[i].Placeholder, layout.PositionalMerged = mergedSlotPlaceholder(layout.MergedProps[i], ctx)
    }
    if layout.PositionalMerged {
        layout.AtomicNeedsTuple = compactPositionalNeedsEnvelope(layout) // Design §2
    } else if !layout.AtomicNeedsTuple && compactUnionEnvelope(rt, ctx) {
        layout.AtomicNeedsTuple = true // today's rule
    }

**Plain compact objects**
- `json_compact.go`: `compactDeclaredSlot` (:151-158) gains `placeholder`, filled at :207-213; replace
  `null` at :241 and :244 with it. A guarded (`nonEnumerable`) slot also writes it for an own-enumerable
  `undefined`, which JSON would otherwise write as a present `null`. Doc comments :15-16, :218-219.
- `json_compact_restore.go:191`: `if (v[i] === <placeholder>) {v[i] = undefined}`; the following
  `else if (!== undefined) {child}` is unchanged, so no constructor ever sees a placeholder. Doc :15.

**Union encode** (`json_prepare_clone.go:704-753`, inline in the merged-prop loop): when
`PositionalMerged`, build the object literal as an array, per prop:

    required: slot = expr
    optional: slot = "(" + present + " ? " + expr + " : " + mp.Placeholder + ")"

(`expr` from `emitMergedPropPrepareSafe`, keeps `[subIdx, v]`; `present` = `v.p !== undefined`, ANDed
with own-enumerability for `constructor` and with the surviving-candidate guard for a stripped
candidate.) Wrap at :748-751 unchanged and shared with the keyed branch. A sub-wrapped slot whose value
matches no candidate cannot drop its key, so `emitMergedPropPrepareSafe` ends its dispatch arms with
`return <Placeholder>` when the prop has one (empty on the keyed form, which keeps falling through to
`undefined`).

**Union decode**
- `json_restore_clone.go:296` (bare path): guard `Array.isArray(v)` instead of `unknownKeysObjectGuard(v)`.
- `union_flat.go:305-311` (wrapped path): `if (dec === -1) { if (Array.isArray(v)) {body} }`; anything
  else is left for validation.
- `emitMergedPropsRebuild` (`json_restore_clone.go:310-328`) reads by position under `PositionalMerged`
  (a mode flag inside the loop, not a second function):

      const r0 = {}; r0.type = v[0];
      if (v[1] !== undefined && v[1] !== 0) {<restore v[1]>; r0.lastFourDigits = v[1];}
      if (v[2] !== undefined && v[2] !== null) {<restore v[2]>; r0.expiryMonth = v[2];}
      v = r0;

**Noop predicates**
- `noop_types.go:678-683` (`compactFromJsonNoopRecursive`): unchanged. An object member already makes
  `unionMemberHidesKey` true (`extraProofRecursive` has no object arm), so a union with a merged object
  is never noop.
- `compactUnionNeedsEnvelope` (`union_flat_compact.go:20-35`): unchanged, document that it only decides
  unions with no positional branch. Encode predicate `isNoopForPrepareJsonSafe` (`noop_types.go:399-425`)
  is false for every union: no change.

**Size bound** (`ts-go-runtypes/internal/cachegen/jsonsize/jsonsize.go`)
- The doc at :10-12 ("never larger than the keyed form") stops being true for unions. `unionBytes`
  (:423-441) takes `max(largest, positionalBound)`, `positionalBound = 2 + Σ over merged props of
  (max(valueBytes + subWrapBytes, placeholderBytes) + 1)`. Its member loop gathers each prop name's
  widest value and declarer count; `positionalMergedBytes` sums them, charging the sub-envelope only to
  a name two or more object members declare, the placeholder being `false` (5 bytes). Counterexample to pin:
  `{a: string(≤1000)} | {b1..b50: boolean}`. Plain objects stay safe (a slot ≤ 6 bytes ≤ `"k":v,`).

**Untouched, confirmed**: `json_schema_doc.go:45`, `remove_unknown_keys.go:458/606`,
`validate_union_keys.go` (unwidened layout or validate-only); `jsonSchemaDoc.ts:57` (throws for
compact); `jsonShape.ts` (default wire only); tuples (shared with clone). No codegen regen: fn hashes
come from the operations registry, the disk cache keys on the binary.

**Comments**: `union_flat.go` header :10-16, `union_flat_compact.go` :7-13 + :47-51,
`noop_types.go:577-581`, `packages/run-types/src/createRTFunctions.ts:174`.

**Security (MustValidateJson, typefunctions/AGENTS.md)**: placeholder mapping runs before any child
restore, so a `0` in an optional Date/bigint/Set/Map slot becomes absent and no constructor runs; a
foreign value in a slot (e.g. `null` where the placeholder is `0`) is left for the existing guards and
validation; required slots never map a placeholder; short arrays read absent, extra slots are ignored.
Keyed input at a positional union is left untouched (like plain compact objects); route params still go
through `validateUnionKeys`. Run the `add-diagnostic` checklist (emit arms change; no new code).

## Tests

**Go** (`go -C ts-go-runtypes test ./internal/... ./cmd/...`)
- New `compact_placeholder_test.go`: `TestCompactWireClasses_EveryKindHasARow` (copy
  `TestNonDataAgreement_EveryKindHasARow`, `nondata_agreement_test.go:107`; break a row, watch it fail),
  plus rows: named class, numeric/mixed enum, `0` literal, bigint literal, union, `number|null`.
- `union_flat_compact_test.go`: :91-133 becomes `…NestedObjectUnionGoesPositional`; :248-273 also
  asserts `buildCompactFlatLayout(...).AtomicNeedsTuple` + `.PositionalMerged`. Keep :135-163, :275-314.
  New in the same file: PaymentMethod encode + decode strings; stripped candidate writes the placeholder;
  sub-wrapped slot; `constructor` prop; `{a}|string[]` wrapped decode; and
  `TestBuildCompactFlatLayout_PositionalAndWrapper` rows for objects-only, `{a}|null` (no wrapper),
  `{a}|string[]` and `{a}|undefined` (wrapper), record carve-out (stays keyed), required `unknown` slot
  fallback.
- `noop_types_test.go`, `internal/compiler/resolver/noop_predicate_test.go` (`noopCorpusSource`): the
  new union shapes. `jsonsize/jsonsize_test.go`: the counterexample bound.

**JS** (`pnpm test`, after `pnpm run check:builds`)
- Round-trips go through the shared serialization suite, which runs every case on mutate, clone and
  compact: new `Unions.ts` cases (PaymentMethod, members sharing a prop, object or null, object or
  string array, same prop with different types, three-level nested object unions) and an `Objects.ts`
  case (`{s?: string | null; n?: number | null}`).
- `test/features/compactWireForm.test.ts` (was `suites/serialization/CompactUnionEncoding.test.ts`)
  pins only the exact compact text a round-trip cannot see: PaymentMethod[] exact string +
  `length === 164`; nested unions at every level; `{a}|string[]` → `[-1,["x"]]`; `{tag}|null` →
  `["x"]`/`null`; `{a}|undefined` wraps; a stray shared-slot value writes `0`; the placeholder per
  slot type (`0` / `false` / `null`, `unknown` keeps the collapse); value-first vs static marker parity.
- `test/features/jsonDecodeWireForm.test.ts:62`: attacker cases: `{when?: Date}` `[0]`→`{}`, `[null]`
  refused; `{s: string}` `[0]` refused; a merged slot with `0`.
- Must pass unchanged: `unknownKeyFamiliesAgree.test.ts`, `nonEnumerableGuard.test.ts`,
  `RecordUnionEncoding.test.ts`, `encoderModes.test.ts`.
- `packages/rpc-client/test/lib/serializer.compact.spec.ts`: one compact union route on
  `private-test-server`, end to end.

## Fuzzing

Existing lanes already hold the oracles (round-trip, compare-to-reference, size bound); extend them
through the fuzzy-testing skill, no new fuzzer:
- `fuzz/roundtrip/roundtripOracle.ts:317-391` (`compactNullRisk`): only an optional whose slot has no
  free placeholder. Comments :10, :71-74. RT-AGREE also re-encodes every lane's decoded value through
  compact (beside clone and mutate), pinned by `roundtripOracle.unit.test.ts`.
- Compact added to the multi-strategy feature tests that lacked it: `indexSigNamedSibling`,
  `prototypeKeys` (Map / Set names), `overrides/JsonValueFns`.
- `fuzz/type/typeFuzzRunner.unit.test.ts:65-84`: `{p?: null | string}` → not at risk.
- `fuzz/type/compactUnionNestedObject.smoke.test.ts`: PaymentMethod, nullable object, keyed fallback.
- `fuzz/type/jsonSizeFuzzRunner.ts:183`, `unionMergedPropJsonSize.smoke.test.ts`: measure compact
  output against the bound (shipped as a third oracle, `JS-MAX-COMPACT`, beside `JS-MAX-ENCODER`).
- Wording: `value/fuzzOracle.ts:777`, `type/diagOracle.ts:83`, `fuzz/README.md:233`.
- Run: `pnpm miondevx core fuzz roundtrip types value jsonsize elision secjson secgen --quick`.

## Docs

- `container/website/content/01.rpc/02.server/07.json-round-trip.md`, existing section
  "Compact in Practice": replace the `null` bullet (a missing optional travels as the first of `0`,
  `null`, `false` its type cannot hold, so a present `null` survives; only `any`/`unknown`-like optionals
  still collapse) and add one bullet (unions of objects go positional too, one array covering every
  member's props; a wrapper only when another member is not a plain string, number, boolean or null).
- `container/website/content/02.runtypes/02.guide/04.json-round-trip.md`, existing section
  "JSON Strategies": the same two facts in its compact bullets (:58-59).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Wire compatibility

Nothing extra: the route `syncId` folds in the mion version and the `'compact'` wire format, so a
release bump makes an old client answer `route-types-mismatch`; fetched clients run the server's own
compiled functions. Note "compact wire changed" in the release notes.

## Out of scope

- Tuple optional placeholders (shared with clone and mutate, typed by `JSONShapeArraySlot`).
- Positional encoding for unions with an index-signature member.
- Trimming trailing placeholders.
- A JSON Schema or `JSONShape` type for the compact wire.

## Done when

- Compact writes a union's merged object as one positional array; `PaymentMethod[]` above is exactly
  the 164-byte string, and round-trips.
- Wrapper only when a non-object member is not always a plain JSON scalar (array, bigint, `undefined`,
  any class, `any`/`unknown`); `{a}|string[]` still decodes correctly.
- Every compact slot uses the first free placeholder of `0` / `null` / `false`; `s?: string | null`
  round-trips a present `null`.
- The JSON size bound holds for compact unions (pinned counterexample).
- Go tests, `pnpm test` and the listed fuzz lanes are green; the wire-class kind-coverage test exists.
- Both docs pages updated.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
