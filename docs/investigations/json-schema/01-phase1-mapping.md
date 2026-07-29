# JSON Schema × RunTypes — Phase 1: full mapping & discovery

- **Status:** investigation (Phase 1 deliverable)
- **Branch:** `claude/json-schema-runtypes-ti1zm3`
- **Dialect pinned:** JSON Schema **draft 2020-12** (see §1)
- **Companions:** [02-phase2-first-class-input.md](02-phase2-first-class-input.md), [03-phase2-derived-output.md](03-phase2-derived-output.md), [04-migration-plan.md](04-migration-plan.md)

This document maps the entire RunTypes node vocabulary (every `RunTypeKind` + `RunTypeSubKind` the big emit switch handles) and every built-in TypeFormat onto JSON Schema 2020-12, in both directions, and catalogues the behavioral quirks where the two models disagree. It is the factual basis for the Phase 2 design decisions; open decisions are marked **DECISION** and resolved in [04-migration-plan.md](04-migration-plan.md).

---

## 1. Dialect: why 2020-12

Three drafts matter in the wild:

| Draft | Why it matters | State |
| --- | --- | --- |
| draft-07 (2018) | Most widely deployed baseline. AJV's default, most of schemastore.org, VS Code JSON, OpenAPI 3.0 heritage. | Legacy default |
| 2019-09 | `$defs`, `unevaluatedProperties`, `dependentRequired`. Rarely targeted directly. | Skipped by most |
| **2020-12** | `prefixItems` (real tuples), `$dynamicRef`, `format: uuid/duration`. **OpenAPI 3.1 is fully aligned with it.** AJV supports it via `ajv/dist/2020`; zod v4 / Pydantic v2 / TypeBox emit it. | **Modern standard** |

**Pinned: 2020-12.** Rationale:

1. **Tuples.** RunTypes has first-class tuples (`KindTuple` with optional members + rest). Only 2020-12's `prefixItems`/`items` split expresses them cleanly (draft-07's `items: []` + `additionalItems` is deprecated syntax with well-known validator quirks).
2. **Closed shapes under composition.** TS intersections must map to `allOf`, and `additionalProperties: false` famously breaks under `allOf` in draft-07. 2020-12's `unevaluatedProperties: false` is the only correct encoding of a closed intersected object.
3. **Formats.** `uuid` and `duration` exist as registered formats only from 2019-09/2020-12; RunTypes has both (UUID format family, Temporal.Duration).
4. **Ecosystem direction.** OpenAPI 3.1, AJV 2020, and every modern generator emit it; an AJV-replacement story lands on people validating with `ajv/dist/2020` or any 3.1 toolchain.

**draft-07 compatibility is a documented downlevel, not a second target.** The mapping below is per-keyword, so a later `target: 'draft-07'` option is mechanical. The deltas that matter are listed in §5.14; everything else in this doc emits identically under draft-07.

## 2. How to read this document

Two independent directions, with different bars for success:

- **OUT (`T → schema`)** — Phase 2.2's `createJsonSchemaFn<T>()`: derive a schema from a reflected RunType graph. Bar: the schema must be **true** — a value the RunTypes validator/encoder accepts must validate against the schema, and diagnostics must flag anything unrepresentable (the DataOnly discipline: **Warning** = expected drop, **Error** = would lie at runtime).
- **IN (`schema → T`)** — Phase 2.1's first-class schema input: infer a TS type (and RunTypes format brands) from a schema literal so `createXFn(...)` works. Bar: type-relevant keywords must shape `T`; constraint keywords must land in **format params** (which participate in the structural id, so they are not "lost annotations" — they generate real validators); anything unmappable must raise a diagnostic instead of silently weakening validation.

A load-bearing observation for both directions: **RunTypes' TypeFormat params are a superset of plain TS**, and they carry `minLength`/`min`/`pattern`/… — i.e. most of JSON Schema's *validation* vocabulary already exists in RunTypes as formats. The mapping is therefore much closer to lossless than a plain-TypeScript mapping (à la `json-schema-to-ts`) could ever be.

### 2.1 The projection question (OUT)

RunTypes validators check **live JS values** (real `Date`s, `bigint`s, `Map`s); JSON Schema validates **parsed JSON documents**. These domains differ exactly on the non-JSON-native kinds. Two candidate projections for the emitted schema:

- **Value projection** — describes what `createValidateFn<T>` accepts. Not JSON-expressible for `Date`/`bigint`/`Map`/`Set`/Temporal (a JSON document simply cannot contain them).
- **Wire projection** — describes what `createJsonEncoderFn<T>` emits / what `createJsonDecoderFn<T>` accepts as `JSON.parse` output. Fully JSON-expressible, because the JSON family already defines the wire form of every serializable kind (verified in `json_prepare.go`):
  - `bigint` → `v.toString()` → **string** on the wire
  - `Date` → untouched; `JSON.stringify` invokes `toJSON()` → **ISO 8601 string**
  - Temporal builtins → same `toJSON()` path → **ISO strings**
  - `Map` → `Array.from(v)` → **array of `[key, value]` pairs**
  - `Set` → `Array.from(v)` → **array of items**
  - non-serializable natives (typed arrays, `WeakMap`, …) → `CodeNS` → alwaysThrow (PJ001/PJ002)

For JSON-native DTOs (the overwhelmingly common case) the two projections coincide. **DECISION (resolved in the plan):** default to the wire projection — that is what an external JSON Schema consumer actually validates and the AJV-replacement semantics — with per-kind strictness knobs (Map/Set default to a build Error per the DataOnly instinct; see §3 notes).

---

## 3. The kind map (the big switch → JSON Schema)

Source of truth enumerated: `RunTypeKind` (36 kinds + `ref` sentinel) and `RunTypeSubKind` from `packages/ts-runtypes/src/go-generated/runTypeKind.generated.ts` / `ts-go-runtypes/internal/protocol/{protocol,subkind}.go`. Family classification (A/C/M/F) and the not-supported set from `internal/protocol/family.go` (`IsNotSupportedKind`: `never`, `symbol`, `function`, `method`, `methodSignature`, `callSignature`, `class+SubKindNonSerializable`).

Verdicts: ✅ full mapping · 🟡 mapped with loss or caveats · 🚫 no JSON Schema equivalent (diagnostic territory) · ⚙️ structural node that dissolves into its parent's schema (no schema of its own).

### 3.1 Atomic kinds (family A)

| Kind (id) | OUT: `T → schema` (2020-12) | IN: `schema → T` | Verdict / notes |
| --- | --- | --- | --- |
| `never` (0) | Property position: **drop the property** (mirror DataOnly, Warning). Root/propagating: could emit `false` (the always-failing schema) — but validators treat root `never` as "no value passes", so `false` is actually *faithful*. | `false` or `{not: {}}` → `never` | 🟡 OUT: `false` is representable and true; consistency with DataOnly (which strips to `never`) argues for drop-at-prop + `false` at root. IN: ✅ trivial. |
| `any` (1) | `true` (or `{}`) | `true` / `{}` → `unknown` (prefer `unknown` over `any` for inference) | ✅ Boolean schemas exist in all drafts. |
| `unknown` (2) | `true` | `true`/`{}` → `unknown` | ✅ |
| `void` (3) | No JSON form (`undefined` is not JSON). Property: contributes optionality then drops. Root: Error. | n/a — never produced | 🚫 See §5.2 (undefined trio). |
| `object` (4) — the broad `object` type | `{type: "object"}` 🟡 — JS `typeof v === 'object'` also matches arrays; JSON Schema `"object"` excludes them. Closest faithful: `{type: ["object", "array"]}`. | not produced (schemas are always structured) | 🟡 Broad kind; validator emits an object guard. Emit `{type: ["object", "array"]}` for truth or plain `object` + Warning. |
| `string` (5) | `{type: "string"}` (+format keywords, §4) | `{type: "string"}` → `string` (+params → `String<P>`) | ✅ |
| `number` (6) | `{type: "number"}` (+format keywords). `integer: true` param → `{type: "integer"}`. | `"number"` → `number`; `"integer"` → `Number<{integer: true}>` | ✅ NaN/Infinity alignment: see §5.6. |
| `boolean` (7) | `{type: "boolean"}` | → `boolean` | ✅ |
| `symbol` (8) | 🚫 not-supported set: drop at property (Warning VL013-style), Error at root/propagating — exactly DataOnly. | n/a | 🚫 |
| `bigint` (9) | Wire: `{type: "string", pattern: "^-?[0-9]+$"}` (encoder emits `v.toString()`). Value projection: unrepresentable. | No standard JSON Schema form. (Optional recognition of the common `{type: "integer", format: "int64"}` OpenAPI idiom → `bigint` could be offered later; NOT in scope.) | 🟡 OUT: faithful on the wire; numeric bounds from `BigIntParams` are **not** expressible on a string (§4.9). IN: 🚫 gap. |
| `null` (10) | `{type: "null"}` | `{type: "null"}` → `null` | ✅ |
| `undefined` (11) | No JSON form. Property `a: T \| undefined` → treat as optional-on-the-wire; union member → stripped with Warning; root → Error. | n/a | 🚫 §5.2. |
| `regexp` (12) | 🚫 `RegExp` instances have no wire form (`JSON.stringify(/x/)` → `{}`). Drop at prop (Warning) / Error at propagating. | n/a | 🚫 To validate a *string* against a pattern use the string format — that maps (§4.2). |
| `literal` (13) | `{const: value}` for string/number/boolean/null literals. bigint literal → wire `{const: "<digits>"}`. | `const` → `literal(value)` type; `enum: [v]` singleton behaves the same | ✅ `const` exists since draft-06. |
| `templateLiteral` (14) | `{type: "string", pattern: "<anchored regex>"}` — the validate emitter **already composes exactly this regex** from the segments (hoisted as a context const); reuse it verbatim. | `pattern` → cannot recover a template-literal type (regex → type is undecidable); stays `String<{pattern}>` | ✅ OUT (regex already exists). IN: 🟡 by design. |
| `enum` (22) + `enumMember` (28) | `{enum: [...rt.values]}` (string/number members). Member **names** are lost — JSON Schema `enum` carries no labels. Optional: emit sibling annotation (see §5.7). | `enum: [...]` → union of literals (`'a' \| 'b'`), i.e. the same shape the value-first `enumType` builder produces (kind union, `idDivergent` from a nominal TS enum — same as the documented builder behavior) | ✅ values; 🟡 names (annotation-only). |

### 3.2 Collection kinds (family C)

| Kind (id) | OUT | IN | Verdict / notes |
| --- | --- | --- | --- |
| `objectLiteral` (30) | `{type: "object", properties: {...}, required: [...]}` — per-property `optional` inverts into the object-level `required` array (§5.1). Open by default (no `additionalProperties`), matching `createValidateFn`'s structural openness; closedness is a separate axis (§5.4). Interface `extends` parents are already merged into `children` by the checker, so no `allOf` needed for inheritance. | `properties` + `required` → object type with `?` on non-required keys; `additionalProperties: <schema>` alongside `properties` → intersection with index signature; `additionalProperties: false` → same TS type + pair with unknown-keys family (§5.4) | ✅ The core case. |
| `class` (20), `SubKindNone` (user class) | Structural object schema of its **data** members (methods dropped w/ Warning — matches validate, which checks classes by shape, not `instanceof`). `title: <className>` annotation. Class identity / `registerClassSerializer` round-trip semantics are not expressible (§5.10). | n/a — schemas never produce nominal classes | 🟡 structural-only. |
| `union` (23) | `{anyOf: [...]}`. Use `children` (declaration order) not `safeUnionChildren` (that ordering exists for validator short-circuit correctness; JSON Schema `anyOf` has no ordering semantics). Members from the DataOnly strip set (symbol/function/Promise/never/non-serializable) are dropped with Warning — same as `dataOnlyUnionMembers` in the union emitters. `T \| null` with a simple base → shorthand `{type: ["string", "null"]}` allowed; `T \| undefined` → optionality/strip (§5.2). `unionDiscriminators` (when populated) → optional OpenAPI-style `discriminator` annotation, NOT a validation keyword (§5.8). | `anyOf` → union; `oneOf` → union **with Warning** (TS cannot express exclusivity; xor semantics weaken to inclusive-or, §5.9); `type: ["a","b"]` array form → union | ✅ / 🟡 oneOf. |
| `intersection` (24) | `{allOf: [...]}` — semantically correct for object members (a value must satisfy all). Note the checker already **collapses** `primitive & {meta}` intersections into `formatAnnotation`/`typeMeta` before this node is reached, so surviving intersections are object-ish. Closed-shape interplay: `unevaluatedProperties`, §5.4. | `allOf` → intersection (`A & B`) | ✅ (2020-12 needed for closed shapes). |
| `tuple` (26) | `{type: "array", prefixItems: [...], minItems: <requiredCount>, maxItems: <len>}`; no rest → `items: false` (validator likewise rejects `v.length > N` only when restless); rest → `items: <restSchema>` and drop `maxItems`; optional members → `minItems` = index of first optional. | `prefixItems` (+`items` rest / `items: false`) → tuple type with `?` members from `minItems` | ✅ Showcase 2020-12 case. |
| `templateLiteral` | (listed under atomic — Collection family-wise, emits one regex) | | |

### 3.3 Member kinds (family M) — structural, dissolve into the parent

| Kind (id) | Role | Mapping |
| --- | --- | --- |
| `property` (15) / `propertySignature` (32) | named member | ⚙️ → `properties[name]` + `required` membership; `readonly` → `readOnly: true` (annotation); `nonEnumerable` → forced optional (wire may omit it — exactly what the flag means); symbol-keyed (`@@name` + `flags: ["symbol"]`) → dropped w/ Warning (matches emitters). JSDoc `description` (v2 field) → `description`. |
| `parameter` (18) | function param | ⚙️ inside function kinds — out of scope for data schemas (function kinds are 🚫). |
| `array` (25) | element wrapper | `{type: "array", items: <child>}` ✅. NOTE the RunTypes gap: no min/max-items/unique params exist today (§5.12). |
| `rest` (29) | tuple rest | ⚙️ → `items: <child>` after `prefixItems` ✅. |
| `indexSignature` (31) | `{[k: K]: V}` | `string` key → `additionalProperties: <V>` (with sibling named props listed in `properties` — JSON Schema's `additionalProperties` applies only to unlisted keys, which matches the emitters' sibling-skip logic exactly). `number` key → `patternProperties: {"^(?:0\|[1-9][0-9]*)$": <V>}` 🟡 (JS number keys are strings on the wire). Template-literal key → `patternProperties: {"<anchored regex>": <V>}` ✅ (regex already emitted for validation). Symbol-keyed sigs → skipped (matches `isSymbolKeyedIndexSig`). Key formats (e.g. UUID keys) → `propertyNames: {...}`. IN: `additionalProperties: S` → `Record<string, T>`; `patternProperties` → `Record<string, T>` with Warning (pattern → key type undecidable, §5.11). |
| `tupleMember` (27) | tuple slot | ⚙️ → `prefixItems[position]`; `optional` → drives `minItems`; labels (named tuple members) → per-item `title` annotation. |
| `promise` (19) | thenable | 🚫 for schemas: validation-supported (thenable gate) but not data — DataOnly strips it; drop at prop (Warning), Error at propagating. Matches the serializer families, intentionally diverging from bare validate. |

### 3.4 Function kinds (family F) — all 🚫

`function` (17), `method` (16), `methodSignature` (33), `callSignature` (35): the not-supported set. Property position → dropped from `properties` with Warning (the VL010/…011 pattern); propagating position (array element, tuple slot, union-all-stripped, root) → build **Error** + no schema (the alwaysThrow pattern). A callable interface (`callSignature` child inside an object) projects its **data properties only**, with Warning — mirroring `emitObjectValidate`'s callable handling.

### 3.5 Reserved / sentinel kinds

| Kind (id) | Mapping |
| --- | --- |
| `typeParameter` (21), `infer` (34) | Cannot appear in a resolved call-site type (the resolver monomorphizes `T`). If ever encountered: internal Error diagnostic. |
| `ref` (−1) | `{$ref: "#/$defs/<id>"}` ✅ — a **structurally perfect fit**: the runtype graph is already hash-consed by structural id, so every shared/named node becomes one `$defs` entry keyed by its id (readable alias: `typeName` when present, id as suffix for uniqueness). `isCircular` nodes MUST go through `$defs` (JSON Schema handles recursion only via `$ref`). Root schema gets `$id` + `$schema`. |

### 3.6 SubKinds

| SubKind (id) | OUT | IN | Notes |
| --- | --- | --- | --- |
| `mapKey`/`mapValue`/`setItem` (1801–03) | ⚙️ parameter-position wrappers inside Map/Set nodes (reached exactly as `mapKeyValueTypes`/`setItemType` do) | n/a | structural |
| `date` (2001) — `Date` | Wire: `{type: "string", format: "date-time"}` (encoder relies on `toJSON()` → ISO). `NativeDateParams` bounds: §4.6. | (no standard idiom maps back to `Date`; `format: date-time` maps to `StringDateTime` instead — revival to `Date` would be a decoder concern, out of scope) | ✅ wire / 🚫 value projection |
| `map` (2002) — `Map<K,V>` | Wire (faithful): `{type: "array", items: {type: "array", prefixItems: [K, V], items: false, minItems: 2}}`. **DECISION:** default build **Error** (user preference, DataOnly instinct) with opt-in `'wire'` mapping — an external consumer would not guess the pairs convention. | 🚫 | 🟡 |
| `set` (2003) — `Set<V>` | Wire: `{type: "array", items: V, uniqueItems: true}` — `uniqueItems` is a genuinely pleasant fit for Set semantics. Same **DECISION** default-Error as Map. | 🚫 | 🟡 |
| `nonSerializable` (2004) — typed arrays, `WeakMap`, `Error` subtree, … | 🚫 not-supported set: drop at prop (Warning …015), Error at root/propagating — identical to every serializer family. | n/a | 🚫 |
| `temporalInstant` (2101) | `{type: "string", format: "date-time"}` (toJSON → RFC 3339 with offset) | — | ✅ wire |
| `temporalZonedDateTime` (2102) | 🟡 `toJSON()` emits RFC 3339 **plus a bracketed zone suffix** (`…+01:00[Europe/Madrid]`) — that is RFC 9557, **not** valid `format: date-time`. Must emit `pattern`, not `format`. | — | 🟡 the classic trap; see §5.13 |
| `temporalPlainDate` (2103) | `{type: "string", format: "date"}` | — | ✅ |
| `temporalPlainTime` (2104) | 🟡 `format: time` requires an offset per RFC 3339 `full-time`; `PlainTime.toJSON()` has none → `pattern`. | — | 🟡 |
| `temporalPlainDateTime` (2105) | 🟡 local datetime (no offset) — `format: date-time` requires offset → `pattern`. | — | 🟡 |
| `temporalPlainYearMonth` (2106) / `temporalPlainMonthDay` (2107) | `pattern` (`^\d{4}-\d{2}$` / `^--?\d{2}-\d{2}$` per toJSON forms) | — | 🟡 |
| `temporalDuration` (2108) | `{type: "string", format: "duration"}` — 2020-12 registered format, ISO 8601 duration, exactly `Duration.toJSON()` | — | ✅ |

---

## 4. TypeFormats map

The 18 canonical format names (from `typeFormats.generated.ts`, i.e. the Go format-emitter registry) with their full param surfaces (from `packages/ts-runtypes/src/formats/**`). Two mapping layers: the format **name** → JSON Schema `format` (annotation-by-default! see §5.5), and each **param** → a hard validation keyword where one exists. Params that only affect mocking (`mockSamples`) or transformation (`trim`, `lowercase`, …) intentionally have **no** schema counterpart — the schema describes what validators enforce, and validators ignore those too (consistent, not lossy). `mockSamples` → `examples` annotation is a free nicety.

### 4.1 `stringFormat` (base `string`) — params `StringParams`

| Param | OUT keyword | IN (schema → param) | Notes |
| --- | --- | --- | --- |
| `minLength` / `maxLength` | `minLength` / `maxLength` | ✅ both ways | direct |
| `length` | `minLength` = `maxLength` = n | (n/a — normalize on input to min=max) | direct |
| `pattern.source` | `pattern` | `pattern` → `String<{pattern: {source, mockSamples: ???}}>` | 🟡 **flags problem** OUT (§5.3): JSON Schema `pattern` carries no flags — emit only flagless (or `u`-only) patterns, otherwise Warning + drop. 🟡 **mockSamples problem** IN: RunTypes requires samples with a pattern (mock soundness); an imported schema has none — see quirk §5.11. |
| `allowedChars {val, ignoreCase}` | synthesized `pattern: "^[<escaped>]*$"` | (stays a pattern) | escape for char-class; `ignoreCase` → expand both cases into the class (flags unusable). |
| `disallowedChars {val}` | `pattern: "^[^<escaped>]*$"` | (stays a pattern) | same. |
| `allowedValues.val` | `enum: [...]` | `enum` (all-string) → `String<{allowedValues}>` **or** plain literal union — IN prefers the literal union (§3.1 enum row) | `ignoreCase: true` → no keyword; expand values or Warning. |
| `disallowedValues.val` | `not: {enum: [...]}` | `not.enum` → `String<{disallowedValues}>` | `not` is fully supported by validators. |
| `trim`/`lowercase`/`uppercase`/`capitalize`/`replace`/`replaceAll` | — (transform-only; validate ignores them) | — | consistent no-op both sides. |
| `mockSamples` | `examples: [...]` (annotation) | `examples` → `mockSamples` 🎁 | free round-trip that feeds the mocker. |

### 4.2 `uuid` — params `{version: '4' \| '7'}`

- OUT: `format: "uuid"` (+ `pattern` pinning the version nibble, since `format: uuid` accepts any RFC 4122/9562 version): v4 → `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` (case per emitter), v7 analogous.
- IN: `format: "uuid"` → version-agnostic… but RunTypes' uuid family **requires** a version param. Options: map to `String<{pattern: <rfc-uuid>}>`, or add a `version: 'any'` to `UUIDParams` (small Go change). Flagged as a gap in the plan.
- draft-07: no `uuid` format — pattern-only downlevel.

### 4.3 `email` — params `EmailParams` (`maxLength`, `minLength`, `pattern`, `localPart`, `domain`)

- OUT: `format: "email"` (+ `minLength`/`maxLength`; + `pattern` when the format runs the pattern path). The decomposed `localPart`/`domain` sub-validators exceed what any schema keyword expresses → covered by the coarse `format` + Warning listing the unexpressed sub-params. `EmailPunycode` is ASCII → still `email`; a future unicode-local-part variant would be `idn-email`.
- IN: `format: "email"` → `Email` (the default preset). ✅

### 4.4 `domain` — params `DomainParams` (bounds, `maxParts`/`minParts`, `pattern`, `names`, `tld`, `allowedValues`)

- OUT: `format: "hostname"` (`DomainUnicode` → `idn-hostname`) + `minLength`/`maxLength` (+ `pattern` when on the pattern path). `maxParts`/`minParts`/`names`/`tld` decomposition → not expressible → Warning list.
- IN: `format: "hostname"` → `Domain`; `idn-hostname` → `DomainUnicode`. ✅

### 4.5 `ip` — params `{version: 4 \| 6 \| 'any', allowLocalHost?, allowPort?}`

- OUT: `version: 4` → `format: "ipv4"`; `6` → `format: "ipv6"`; `'any'` → `anyOf: [{format: "ipv4"}, {format: "ipv6"}]` (or pattern). **`allowPort: true` breaks both formats** (an `ip:port` string is not a valid `ipv4`) → pattern-only + Warning. `allowLocalHost` is within format semantics (127.0.0.1 is a valid ipv4) — no keyword impact.
- IN: `format: "ipv4"` → `IPv4`; `"ipv6"` → `IPv6`. ✅

### 4.6 String `date` / `time` / `dateTime` — params `DateParams`/`TimeParams`/`DateTimeParams` (layout + `MinMax` bounds)

The **layout** param decides whether a registered format applies (§5.13 spells out the RFC 3339 fine print):

| Layout | OUT |
| --- | --- |
| `date` w/ `format: 'ISO'` or `'YYYY-MM-DD'` | `format: "date"` ✅ |
| `date` other layouts (`DD-MM-YYYY`, `MM-DD`, …) | derived `pattern` 🟡 |
| `time` w/ ISO **including offset** | `format: "time"` ✅ (RFC 3339 `full-time` requires the offset) |
| `time` partial layouts (`HH:mm`, `mm:ss`, `HH`, …) | derived `pattern` 🟡 |
| `dateTime` ISO+ISO+`T` with offset | `format: "date-time"` ✅ |
| `dateTime` other combos / other `splitChar` | derived `pattern` 🟡 |

**Bounds (`min`/`max`/`gt`/`lt`)**: JSON Schema has **no** value-comparison keywords for date/time strings. Absolute bounds → optionally emit the well-known AJV extension keywords `formatMinimum`/`formatMaximum`/`formatExclusiveMinimum`/`formatExclusiveMaximum` behind a vendor-extensions option (validated by `ajv-formats`; ignored as unknown keywords elsewhere — legal in 2020-12); otherwise Warning. **Relative bounds (`now±P…`) are dynamic and can NEVER be expressed** in a static schema → Warning always. Same story for `nativeDate` (2001) and the Temporal formats' bounds.

- IN: `format: "date"` → `StringDate` (ISO), `"time"` → `StringTime` (ISO), `"date-time"` → `StringDateTime` (ISO/`T`). ✅ clean.

### 4.7 `nativeDate` (base `class Date`) — params `NativeDateParams` (MinMax bounds)

Wire `{type: "string", format: "date-time"}` + the §4.6 bounds story. Value projection: unrepresentable (§2.1).

### 4.8 `numberFormat` (base `number`) — params `NumberParams`

| Param | OUT keyword | IN | Notes |
| --- | --- | --- | --- |
| `integer: true` | `type: "integer"` | `type: "integer"` → `Number<{integer: true}>` | ✅ note: `integer` is a *type* in JSON Schema, a *param* in RunTypes (§5.6). |
| `float: true` | 🚫 no keyword ("not an integer"). `not: {multipleOf: 1}` is technically expressible but obscure — Warning by default, the `not` trick behind an option. | — | 🟡 |
| `min` / `max` | `minimum` / `maximum` | ✅ | direct (2020-12 numeric exclusives; draft-04's boolean form is ancient history). |
| `gt` / `lt` | `exclusiveMinimum` / `exclusiveMaximum` | ✅ | direct. |
| `multipleOf` | `multipleOf` | ✅ | direct. |
| `isCurrency` | annotation only (`x-currency: true` behind vendor option, else dropped silently — it is presentation metadata with no failable constraint, mirroring its own contract) | — | ✅-by-definition. |

### 4.9 `bigintFormat` (base `bigint`) — params `BigIntParams` (`min`/`max`/`lt`/`gt`/`multipleOf` as bigints)

Wire is a **string** (`^-?[0-9]+$`), so the numeric bounds **cannot** be expressed as schema keywords (string comparison ≠ numeric comparison; `maxLength` only bounds digit count). → pattern + Warning listing dropped bounds. (A vendor extension could carry them as annotations for documentation purposes.) IN: 🚫 (no schema idiom produces `bigint`; see §3.1).

### 4.10 Temporal formats (`temporalInstant` … `temporalPlainYearMonth`, base `class`) — params: MinMax bounds

Per-subkind string mappings as in §3.6; bounds as in §4.6. `temporalDuration` has no dedicated format name in the table (it rides the class subkind — `Temporal.Duration` currently has no param'd format family) → `format: "duration"`.

### 4.11 IN-direction format table (reverse lookup)

For Phase 2.1, the `format` keyword → RunTypes brand map (unknown formats → plain `string`, **matching 2020-12's annotation-by-default semantics** — but surfaced as an Info/Warning so silently-weaker validation is visible):

| JSON Schema `format` | RunTypes type | Status |
| --- | --- | --- |
| `email` | `Email` | ✅ |
| `idn-email` | — (gap; nearest `Email`) | 🟡 |
| `hostname` / `idn-hostname` | `Domain` / `DomainUnicode` | ✅ |
| `ipv4` / `ipv6` | `IPv4` / `IPv6` | ✅ |
| `uri` / `uri-reference` / `iri` | `Url` (nearest; reference/iri are looser) | 🟡 |
| `uuid` | `UUIDv4`-shaped… version gap (§4.2) | 🟡 |
| `date` / `time` / `date-time` | `StringDate` / `StringTime` / `StringDateTime` (ISO presets) | ✅ |
| `duration` | — (gap: no string duration format family; Temporal.Duration is a class) | 🚫 gap |
| `regex` | — (a string containing a regex; no family) | 🚫 rare |
| `json-pointer` / `relative-json-pointer` / `uri-template` | — | 🚫 rare |

---

## 5. Quirks & impedance mismatches

The behavioral differences that are not visible in the tables. Each is a design input for Phase 2.

1. **Optionality lives at the object level in JSON Schema.** RunTypes/TS mark the *property* (`optional: true` on the property node); JSON Schema marks the *object* (`required: [...]` array listing the non-optional keys). Mechanical inversion OUT (`required` = children where `!optional && !nonEnumerable`); IN, `required` membership decides `?`. Corollary: an all-optional object emits `required: []` — omit the keyword entirely (empty `required` is legal but noisy).

2. **The undefined trio: `undefined` vs `null` vs absent.** JSON has only `null` and absence. Mapping: `a?: T` → absent-able (`required` exclusion); `a: T \| undefined` → **also** `required` exclusion on the wire (encoders omit undefined properties; `JSON.stringify` drops them) — TS distinguishes these two, the wire cannot (matches today's `exactOptionalPropertyTypes`-agnostic runtime behavior); `undefined` union member → stripped with Warning; root `undefined`/`void` → Error. `null` maps cleanly. IN: non-required → `?:` (which under plain TS also admits `undefined` — round-trip asymmetry, documented not fought).

3. **Regex dialect and flags.** JSON Schema `pattern`/`patternProperties` are ECMA-262 regexes but carry **no flags slot**, and interoperable schemas should stay within the spec's recommended subset. RunTypes patterns carry `{source, flags}`. OUT: emit flagless sources verbatim; `u` is safe to drop-emit (source-compatible in the common cases); `i`/`s`/`m` patterns → Warning + omit the keyword (never emit a pattern that is *stricter-dialect* than the validator — a schema must not reject values the validator accepts; when in doubt omit, because JSON Schema keywords compose by AND and omission only loosens). Also note both worlds agree patterns are **unanchored searches** (`.test` semantics) — built-ins already carry `^…$` explicitly, so sources transfer verbatim. The repo's RE2-verifiability machinery (`UncheckedPattern`) already classifies JS-only pattern features; reuse that classification for "portable pattern" detection.

4. **Open vs closed objects.** `createValidateFn` is structurally open (extra keys pass) — matching JSON Schema's default (no `additionalProperties` constraint). Closedness in RunTypes is a *separate family* (`hasUnknownKeys`/`unknownKeyErrors`/`cloneExactShape`); in JSON Schema it is `additionalProperties: false` — but under `allOf` composition that famously fails (each branch sees the other's keys as "additional"), and the only correct encoding is 2020-12's **`unevaluatedProperties: false` on the composed root**. OUT: default open; a `closed: true` option emits `additionalProperties: false` (plain objects) / `unevaluatedProperties: false` (intersections), semantically pairing with `validate + hasUnknownKeys`. IN: `additionalProperties: false` cannot tighten the inferred `T` (TS types are open) — record it and surface "pair this with `createHasUnknownKeysFn`" guidance (or a diagnostics-visible annotation on the generated entry).

5. **`format` is annotation-only by default in 2020-12.** Validators only enforce it under the opt-in format-assertion vocabulary (AJV: `ajv-formats`). RunTypes **always** validates formats. So OUT-consumers may under-validate relative to RunTypes (document loudly: "enable format assertion or rely on the emitted `pattern` twins"), and IN is the happy direction (we validate *more* than a lax consumer). Where a `pattern` twin is emitted next to `format` (uuid version pinning, §4.2), lax consumers still get hard validation — prefer emitting both when cheap.

6. **Number semantics.** JSON cannot carry `NaN`/`±Infinity`, so schema-vs-wire is aligned with the **default** `numberMode: 'isFinite'` (the mode that matches "ajv / typia / JSON Schema" per the option's own docs is `'typeof'`, but on *parsed JSON input* the two agree — non-finite numbers cannot appear). One real divergence: `JSON.stringify(NaN)` → `null` — the encoder can emit `null` where the schema says `number` if a live value was invalid; that is an encoder-input-validity concern, not a schema concern (validate-before-encode). `integer` type vs param: trivial both ways. `-0` survives JSON; no keyword speaks about it; both worlds agree it is a number.

7. **Enum member names are lost.** `{enum: [0, 1]}` carries no `Red`/`Green`. The reflected node has `enumVal` (name → value). Options OUT: plain `enum` (default); or `anyOf: [{const: 0, title: "Red"}, …]` behind an option (verbose but round-trippable and OpenAPI-friendly); or vendor `x-enumNames`. IN: names are unrecoverable → literal-value union (identical to the documented `enumType` builder behavior — value-equal, `idDivergent` from the nominal TS enum).

8. **Discriminated unions.** The wire graph already computes `unionDiscriminators` (serialize-time detection). JSON Schema 2020-12 has **no** discriminator keyword — `discriminator` is an OpenAPI 3.1 extension keyword. `anyOf` alone is semantically sufficient (just slower for consumers). OUT: optionally attach `discriminator: {propertyName}` behind an `openapi: true` vendor option; never rely on it for validation semantics.

9. **`oneOf` exclusivity.** TS unions are inclusive-or. IN: `oneOf` → union + Warning (exactly-one semantics weaken; a value matching two branches validates in RunTypes but fails the original schema). OUT: always emit `anyOf` (TS can never promise exclusivity; emitting `oneOf` would produce a schema that *rejects* values the validator accepts — the forbidden direction).

10. **Nominal things flatten to structure.** Class identity (`instanceof`, `registerClassSerializer` revival), format **brands** (`BrandName` is a phantom), and enum nominal identity all vanish — schema output is structural with `title` annotations. Two structurally equal branded types share one id today (by design: one type, one id) and will share one `$defs` entry.

11. **`pattern` without `mockSamples` (IN).** RunTypes deliberately refuses a bare pattern (mock soundness: the generator needs samples). An imported JSON Schema has `pattern` but never samples. Options: (a) relax — accept an imported pattern with no samples and make `createMockDataFn` for that type throw a targeted "register samples" error (runtime, pay-for-use); (b) require a sidecar samples map at the import site (`{patternSamples: {...}}`); (c) Warning + keep pattern for validation, mark mock-unsupported. Leaning (c)+(b) as an opt-in — resolved in the plan. The mirror-image OUT is free (our patterns always have samples → `examples`).

12. **Genuine RunTypes gaps surfaced by the mapping** (candidate roadmap items, all fit the existing format-params pattern):
    - array constraints: `minItems`/`maxItems`/`uniqueItems`/`contains`/`minContains`/`maxContains` — no array format family exists;
    - object constraints: `minProperties`/`maxProperties`/`propertyNames` (propertyNames partially covered by index-signature *key* formats), `dependentRequired`/`dependentSchemas`;
    - conditional applicators: `if`/`then`/`else`, `not` (general form) — no counterpart, IN would drop them with Warnings (they do not shape `T` anyway);
    - `contentEncoding`/`contentMediaType` (e.g. base64 payloads) — could map well to a future binary-string format;
    - string `duration` format (§4.11).
    IN-direction policy for ALL unmappable validation keywords: **never drop silently** — each dropped keyword weakens validation vs the source schema and must produce a diagnostic (severity per keyword: Warning for annotation-ish, Error under a strict option).

13. **RFC 3339 fine print for date/time formats** (recurring trap): `format: "date-time"` requires a full offset-carrying timestamp; `format: "time"` requires the offset too; there is **no** registered format for a local (offset-less) datetime, a year-month, or a month-day; and Temporal's `ZonedDateTime.toJSON()` appends the RFC 9557 `[TimeZone]` suffix which **fails** `date-time`. Everything offset-less or suffix-carrying goes out as `pattern`, not `format` (§3.6, §4.6).

14. **draft-07 downlevel deltas** (for the later `target` option): `prefixItems`/`items` → `items: [...]`/`additionalItems`; `$defs` → `definitions`; no `unevaluatedProperties` (closed intersections downgrade to Warning); no `uuid`/`duration` formats (pattern twins already cover uuid); `dependentRequired` → `dependencies`; `$dynamicRef`/`$anchor` unavailable (not used by this design anyway); `contains` variants absent.

15. **The checker normalizes before we ever see the type.** The reflected graph is tsgo's view: unions are subtype-reduced (`'a' \| string` → `string`), `boolean` stays a single kind (not `true \| false`), primitive-with-metadata intersections collapse into `formatAnnotation`/`typeMeta`, interface inheritance is pre-merged into `children`. The schema therefore mirrors the *checker's* type, not the written source — same contract as every other RunTypes family (and the reason value-first and type-first converge). Document to users: "the schema of what your type *means*, not of what you typed."

16. **`$defs`/`$ref` and recursion.** OUT: structural-id hash-consing maps 1:1 onto `$defs`; `isCircular` nodes must be emitted as `$defs` entries referenced by `$ref` (JSON Schema's only recursion mechanism — fully supported by validators). IN: type-level `$ref` resolution is the expensive part of schema-to-type inference (the json-schema-to-ts lesson) and **type-level recursion via `$ref` is out of scope for the first cut** — non-recursive `$defs` lookup is feasible; recursive schemas point users at `circular()`/type-first authoring. Runtime-side (the Go path) recursion is unproblematic.

17. **Standard Schema adjacency.** `createStandardSchema` (already shipped) is the *runtime interop* face; JSON Schema is the *declarative interop* face. They compose: a future `createStandardSchema` could expose the derived JSON Schema on the side, and several ecosystems (OpenAPI generators, form libs) consume exactly that pair.

---

## 6. Coverage verdict (executive summary)

**OUT (`createJsonSchemaFn<T>`), wire projection:**
- ✅ Fully mapped: all primitives, literals, enums (values), objects + optional/required inversion, index signatures (string/template/number-key), arrays, tuples (incl. optional members + rest), unions, intersections, template literals (regex reuse), recursion via `$defs`/`$ref`, `Date`/`Temporal.Instant`/`PlainDate`/`Duration`, bigint-as-string, the whole `numberFormat` param set, most `stringFormat` params, uuid/email/domain/ip/url formats.
- 🟡 Mapped with Warnings: broad `object`, flag-carrying patterns, decomposed email/domain sub-validators, non-ISO date/time layouts (pattern fallback), date/bigint bounds (vendor extension or dropped), `float`, offset-less temporal types (pattern), Map/Set wire forms (behind opt-in; default Error per DataOnly instinct), enum names, ip-with-port.
- 🚫 Diagnostics (mirroring DataOnly/validate exactly — drop at property w/ Warning, Error at root/propagating): symbol, function/method/callSignature, never (root), undefined/void (root), RegExp values, Promise, non-serializable natives.

**IN (first-class schema input):** `type` (incl. array form), `properties`/`required`/`additionalProperties`, `items`/`prefixItems`, `enum`/`const`, `anyOf`/`allOf` (and `oneOf` with Warning), `minLength`/`maxLength`/`pattern`/`format`/`minimum`/`maximum`/`exclusive*`/`multipleOf` all land on existing TS shapes + RunTypes format brands — i.e. **they produce real compiled validators, not annotations**. Unmappable validation keywords (uniqueItems, min/maxItems, if/then/else, …) are diagnosed, never silently dropped. `$ref` (non-recursive) feasible; recursive `$ref` deferred.

The mapping is decisively viable in both directions; the two Phase 2 companion docs prototype each direction against this table.
