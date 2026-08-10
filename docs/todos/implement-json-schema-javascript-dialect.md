---
type: feature
spec: full-plan
status: ready
created: 2026-08-10
---

# Implement the JSON Schema JavaScript dialect spec

## Problem

[docs/json-schema-2020-12-javascript.md](../json-schema-2020-12-javascript.md)
specifies the dialect properly for the first time: `jsType` is a **sibling** of
`type`, not a replacement, so a standard 2020-12 validator still enforces the
wire contract and the extension only records what the decoded value becomes in
JavaScript.

The converter implements none of it. Three things are wrong with the emitted
schemas, and they compound:

1. **`jsType` replaces `type` instead of joining it.** `{jsType: 'Date'}` tells a
   standard validator nothing, so it accepts any value. The schema is not a
   JSON Schema in any useful sense.
2. **`jsFormat` is misnamed and mis-shaped.** It is a RunTypes concept, not a
   JavaScript one, and it carries `{name, params}` as a nested object that
   bypasses the standard constraint keywords entirely, so `minLength` never
   reaches a plain validator.
3. **Four keywords do not belong.** `jsNot` duplicates the standard `not`,
   `jsBigint` and `jsParams` are special cases of rows that now exist, and six
   others are TypeScript facts wearing a `js` prefix.

The 34 behavioural cases in
[json-schema-dialect.test.ts](../../packages/ts-runtypes/test/features/json-schema-dialect.test.ts)
are skipped behind `IMPLEMENTED = false` for exactly this reason. This is the
last piece before the conversion PR merges.

## Progress

**Phase 0 is done** (`9db05e3`): the three missing rules are in the spec and
have conformance cases, and `TemporalInfo.WireFormat` / `WirePattern` are in the
reflection registry with all five patterned types worked out. Nothing calls them
yet.

**Phase 1 was written and reverted** (`c6b073f`) after five Go chain tests
failed. The first reading of that was "the emitter and door must land together
or every id moves". **That reading was wrong**, and measuring it properly is
what produced the slice list below.

## What the door already does correctly

Each new wire shape was handed to the door by hand and converted back to a type.
`X2 = X1` means the door recovered EXACTLY the type it was written as, so the id
is unchanged:

| Shape | Recovered | |
| --- | --- | --- |
| `Date` | `A2 = A1` | ✅ |
| `bigint` | `B2 = B1` | ✅ |
| `123n` | `C2 = B1` | ❌ widened to `bigint` |
| `RegExp` | `D2 = D1` | ✅ |
| `{a: undefined}` | `E2 = E1` | ✅ |
| `Map<string, number>` | `F2 = never` | ❌ |
| `Set<string>` | `G2 = never` | ❌ |
| `Temporal.Instant` | `H2 = H1` | ✅ |

**Six of eight already work.** The door reads `jsType` FIRST and ignores the
wire keywords beside it, which is `CORE-PRECEDENCE` holding by construction —
and it is exactly why `{type: 'string', format: 'date-time', jsType: 'Date'}`
recovers plain `Date` rather than a date-time string.

So **no new id rule is needed**, on either side. The id follows from the
recovered TypeScript type, and that machinery is sound. The two broken rows need
the door to read MORE from the wire, not less: `const` for a bigint literal, and
`items` / `items.prefixItems` for Set and Map, which no longer carry
`typeArguments`.

The original five failures decompose the same way: `BigLit`, `Bag`, `Later`,
`Lookup` and one fuzz case were real id moves (exactly the two broken rows);
`RegExpNative` and `TemporalUnbranded` had no id line at all and were assertion
failures on tests pinning the old spelling.

## Plan — one rule group at a time

The atomic unit is **one rule group's emitter + door + test**, not a phase. Land
a slice, run the id oracle (`go -C ts-go-runtypes test ./internal/convert/`),
fix what it catches, commit green, move on.

Ordered so the cheap, door-free slices go first and the risk concentrates late:

| # | Slice | Door work? |
| --- | --- | --- |
| 1 | `JS-DATE` (+ `CORE-SIBLING`, `CORE-PRECEDENCE`, `CORE-INERT`, which all use Date) | no |
| 2 | `JS-BIGINT` | no |
| 3 | `JS-REGEXP`, `JS-OBJECT` | no |
| 4 | `JS-UNDEFINED`, `JS-VOID` | no |
| 5 | Temporal: `JS-TEMPORAL-*`, all four rules | no |
| 6 | `JS-BIGINT-LITERAL` | **yes** — read `const` under `jsType: 'bigint'` |
| 7 | `JS-MAP`, `JS-SET`, `JS-PROMISE` | **yes** — read the wire instead of `typeArguments` |
| 8 | `RT-FORMAT-*` — the `rtFormat` / `rtFormatParams` split | **yes**, and needs the param routing designed with the door's reverse mapping |
| 9 | The six `ts*` renames | mechanical both sides |
| 10 | `CORE-NOT` — delete `jsNot`, fix the door's `not` collapse | **yes** |
| 11 | `CORE-PORTABLE` + the `convertDialect` config | no |

Slices 1 to 5 are emitter + test only. Slices 6 to 10 are where the real work
is.

**Prerequisite for slicing at all:** the conformance test's `IMPLEMENTED` flag is
global today, so it is all-or-nothing. It has to become a per-rule set
(`LANDED`) that each slice adds to, or no slice can go green on its own.

The phase descriptions below stay as the reference for WHAT each change is; the
table above is the order to do them in.

### Phase 0 — close three gaps in the spec first

Found while planning; the spec cannot be implemented exactly as written.

- **`CORE-PRECEDENCE` is missing.** With `jsType` beside `type`, the door needs a
  stated order or `{type: 'string', format: 'date-time', jsType: 'Date'}` is
  ambiguous. Add: `embedType` → `tsMeta` → `jsType` → `rtFormat` → `tsFunction`
  / `tsTemplate` → standard translation. And the rule that **when `jsType` is
  present the wire constraint keywords are descriptive only** and contribute no
  format params, or `Date` comes back as `StringDateTime`.
- **`JS-BIGINT-LITERAL` is missing.** `123n` has a wire form the spec never
  states: `{type: 'string', const: '123', jsType: 'bigint'}`. This is what lets
  `jsBigint` be deleted rather than renamed.
- **`JS-PROMISE`'s wire form is hand-wavy** ("the resolved value's schema").
  Pin it or drop the row.

Each new rule needs a case in the conformance test or its own coverage check
fails.

### Phase 1 — wire forms (Go emitter)

[ts-go-runtypes/internal/convert/print.go](../../ts-go-runtypes/internal/convert/print.go),
`schemaExprCore` (~2062).

Add a single `wireForm(node)` helper so the wire half is defined in ONE place
rather than scattered through the kind switch. Every `jsType` row then prints
the wire keywords plus its own annotation.

- `bigint` → `{type: 'string', pattern: '^-?[0-9]+$'}`
- `Date` → `{type: 'string', format: 'date-time'}`
- `RegExp` → `{type: 'string'}`
- `undefined` / `void` → `{type: 'null'}` (confirmed against
  `internal/cachegen/typefunctions/json_stringify.go:156-183`)
- `Map` → `{type: 'array', items: {type: 'array', prefixItems: [K, V], minItems: 2, items: false}}`, dropping `typeArguments`
- `Set` → `{type: 'array', items: V, uniqueItems: true}`
- `object` → `{type: ['object', 'array']}`
- Temporal → `format` for Instant / PlainDate / Duration, `pattern` for the
  other five

**The Temporal patterns do not exist anywhere yet.** Define them in
[internal/reflection/temporal.go](../../ts-go-runtypes/internal/reflection/temporal.go)
beside the registry (which already holds `Builtin`, `FormatName`, `NowExpr`),
not in the converter, so validate, serialize and convert can never disagree
about what a Temporal value looks like on the wire.

`symbol` keeps having no schema: it already returns the not-supported sentinel.

### Phase 2 — `rtFormat` + `rtFormatParams`

Same file, the format-annotation branch (~2079-2120).

Split `jsFormat: {name, params}` into `rtFormat: '<name>'` plus params routed in
two directions:

- a param with a standard keyword prints as that keyword (`minLength`,
  `pattern`, `minimum`, `multipleOf`, …), so a plain validator enforces it;
- everything else goes in `rtFormatParams`.

This needs a param → standard-keyword table on the Go side. The door already has
the reverse mapping in `SchemaLoweringByKeyword`; cross-reference the two in a
comment so a new param lands in both.

`RT-FORMAT-DEFAULT` (a param sitting at the standard default) and
`RT-FORMAT-BIGINT` (digit strings) fold `jsParams` and the bigint-params special
case into this one path.

### Phase 3 — renames and deletions

Mechanical, but touches the door, the emitter and every test pinning a spelling:

- `jsLabels` → `tsLabels`, `jsReadonly` → `tsReadonly`, `jsIndexes` →
  `tsIndexes`, `jsTemplate` → `tsTemplate`, `jsFunction` → `tsFunction`,
  `jsMeta` → `tsMeta`
- **delete** `jsNot` (standard `not`), `jsBigint` (Phase 0 rule), `jsParams`
  (Phase 2)

`tsIndexes` and `tsTemplate` must now emit their wire half too (`propertyNames`
/ `patternProperties`, `pattern`) per `TS-WIRE-HALF`.

⚠️ `jsLabels` already ships and appears in emitted schemas today, so this rename
is a breaking change to the dialect as implemented. It also interacts with
[jslabels-schema-to-type-conversion.md](jslabels-schema-to-type-conversion.md),
an open bug about hand-authored `jsLabels` schemas; check whether that todo is
fixed, moved or invalidated by this work.

### Phase 4 — the door

[packages/ts-runtypes/src/json-schema/fromJsonSchema.ts](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts).

- **`jsType` overrides the format-derived type.** The riskiest change: today
  `format: 'date-time'` yields `StringDateTime`, and it must yield `Date` when
  `jsType: 'Date'` sits beside it. Get this wrong and every id moves.
- **`Map` / `Set` read their arguments from the wire schema**
  (`items.prefixItems`, `items`) instead of `typeArguments`.
- **`rtFormat` + `rtFormatParams` + standard keywords** rebuild the exact brand.
- **Fix `not`.** `{type: 'number', not: {…}}` collapses to `never` today
  (verified by probe). `CORE-NOT` routes all negation through it, so this stops
  being a curiosity and becomes load-bearing. It must produce `Not<F>` when the
  negated schema is a format on the same base.
- Rename the `ts*` rows in `SchemaLoweringByKeyword`; it is machine-checked, so a
  missed row fails the typecheck.
- Keep the `DialectShapeKeys` single-probe gate. It is what held the
  instantiation budgets to +2-9% instead of +9-20%, and this change adds more
  probing per node.

### Phase 5 — the extended/standard config

Default stays **extended**: strict-by-default would error on any file containing
a `Date`, since strict means the `embedType` escape is unavailable too.

- Add `convertDialect?: 'extended' | 'standard'` to `PluginOptions`
  ([unplugin.ts](../../packages/ts-runtypes-devtools/src/unplugin.ts)) and to
  `PLUGIN_OPTION_KEY_TABLE`
  ([plugin-option-keys.ts:10](../../packages/ts-runtypes-devtools/src/plugin-option-keys.ts))
  — the `satisfies` guard fails the typecheck if only one side is updated.
- Regenerate the tsconfig plugin key list (`pnpm rtx core codegen`); the
  plugin-option parity test compares the two.
- The existing `--portable` CLI flag becomes the per-run override for
  `'standard'`. Keep the name: it is already documented, tested and in the
  refusal messages.

### Phase 6 — retest the whole conversion surface

- Flip `IMPLEMENTED = true` in the conformance test.
- Update every test pinning a schema spelling: `internal/convert/*_test.go`
  (roundtrip, temporal, functions, circular, livesymbols, reviewfindings) and
  `test/suites/json-schema-define/*`, `test/features/labeledSlots.test.ts`,
  `test/types/jsonSchema.compile.test.ts`.
- **Fuzz oracles**: `test/fuzz/convert/convertRoundtrip.ts` and
  `test/fuzz/jsonschema/schemaRender.ts` both render schemas and need the new
  shapes. The id oracle itself does not change.
- **Converted-suites lane** regenerates from whatever the converter emits, so it
  follows for free — but the refusal counts in
  [scripts/core/converted-suites.mjs](../../scripts/core/converted-suites.mjs)
  will move and must be re-pinned.
- **Instantiation budgets will move again.** Re-baseline with a reviewed
  exception in the test header, per the ratchet protocol.

## Tests

- `json-schema-dialect.test.ts` — the conformance test, one case per spec rule,
  un-skipped. This is the acceptance bar, and its coverage check already fails
  if the spec names a rule with no case.
- Go chain tests keep the id oracle on every leg (type → builders → json-schema
  → type), which is what proves the reshape did not move an identity.
- A NEW test asserting `CORE-INERT` mechanically: strip every extension keyword
  from a converted schema and assert the remainder is still valid 2020-12 and
  accepts / rejects the same sample values. Nothing checks this today, and it is
  the one property the whole design rests on.
- Marker coverage rule: any case touching `getRunTypeId` covers both call shapes.

## Docs

- [docs/json-schema-2020-12-javascript.md](../json-schema-2020-12-javascript.md)
  — the Phase 0 rules.
- `container/website/content/02.guide/02.json-schema.md` and
  `11.converting-forms.md` — keyword tables and the escape narrative.
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — the convert scope paragraph names
  every keyword.
- Wire the `markdown-import` directive (already built, currently unused) into a
  website page so the spec renders there instead of being restated.

## Fuzzing

No new lane. The existing convert roundtrip lane already has the right oracle
(ids equal on every leg, byte-equal type-form fixpoint); it needs its renderers
updated, not its properties.

## Out of scope

- Publishing a real meta-schema document at the dialect URI.
- `$vocabulary` declaration.
- Teaching any third-party validator about the keywords.
- The `x-` prefix question, settled: no. JSON Schema has no such convention (it
  is OpenAPI's), RFC 6648 deprecates the pattern, and the `js` / `ts` / `rt`
  prefixes already read as non-core.

## Done when

- Every rule in the spec has a passing case in `json-schema-dialect.test.ts`,
  with `IMPLEMENTED = true`.
- A converted schema validates its own wire form under a standard 2020-12
  reading, and stripping every extension keyword changes no verdict.
- Ids are unchanged on every leg of every chain test and the fuzz lane.
- `pnpm rtx core converted-suites` regenerates, runs and passes with re-pinned
  refusal counts.
- Full gate: Go suite, `pnpm test`, both fuzz lanes, lint, format.
