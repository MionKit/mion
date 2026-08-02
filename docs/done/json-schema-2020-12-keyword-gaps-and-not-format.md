---
type: feature
spec: full-plan
status: open
created: 2026-08-01
---

# JSON Schema input: full 2020-12 support, no concessions + the `Not` combinator

The shipped input door accepts a deliberate 28-keyword subset (`JsonSchemaInput`,
[fromJsonSchema.ts:62-92](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts))
and rejects everything else at the key. That stance is retired. The schema door
exists to consume documents from existing APIs that we do not control, so a
rejected keyword is just a failure with better manners: **every 2020-12 keyword
is accepted, and validation is exact per the spec.** The limits of TypeScript's
type system constrain only what the *static type* can say, never which schemas
are accepted or what the *validator* enforces. Half-baked acceptance (dropping
a constraint silently) is equally banned.

Absorbed by this spec (implement here, `git mv` to done when shipped):
[json-schema-patternproperties-and-maxitems-gaps.md](json-schema-patternproperties-and-maxitems-gaps.md),
[json-schema-uuid-format-narrows-to-v4.md](json-schema-uuid-format-narrows-to-v4.md).
Also folds in the union-docs truth fix: union validation behaves as EXCLUSIVE
match (oneOf semantics), so the guide's "exclusivity is weakened" section
([02.json-schema.md:86](../../container/website/content/2.guide/02.json-schema.md),
[fromJsonSchema.ts:264-268](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts))
is misleading and must flip after the semantics are pinned by a test.

## The three authorities

For every keyword, three artifacts with distinct truth obligations:

1. **The static type** — the TIGHTEST TypeScript-expressible supertype of the
   accepted value set. It may be wider than the schema (TS cannot express
   complements, counts, uniqueness), it must NEVER be narrower: a type that
   excludes a value the schema accepts is the one unforgivable failure for a
   consume-existing-APIs feature. `never` appears only where the algebra proves
   the accepted set empty.
2. **The generated validator** — exact 2020-12 semantics, always. Where the
   type lost information, the validator does not.
3. **Mock data** — generated from the exact set (validator-checked), never from
   the widened static type. `validate(mock())` holds everywhere.

`validate(v): v is T` stays sound with T wider than the accepted set: a passing
guard implies membership in the exact set, which is a subset of T.

## Static-type policy for negation: kind-complement algebra

The JSON domain is closed over six kinds: `null | boolean | number | string |
array | object`. The complement of a subschema is expressible EXACTLY at kind
granularity and not below it:

- `KindComplement<S>` = the union of JSON kinds that S does NOT wholly claim.
  `{not: {type:'string'}}` → `null | boolean | number | unknown[] |
  Record<string, unknown>` — a real, switchable type, not `unknown`.
- Sub-kind constraints (`pattern`, `minLength`, `properties`, string `enum`)
  contribute nothing statically (their complement keeps the kind) — the kind
  survives whole and only the validator narrows.
- Composition is plain intersection, so tightening is automatic:
  `{type:['string','number'], not:{type:'string'}}` →
  `(string|number) & KindComplement` → `number` (exact, free).
  `{type:'string', not:{type:'string'}}` → `string & (everything-but-string)`
  → `never` — contradictions prove themselves empty; `never` is never used as
  an "inexpressible" shrug.

The same rubric extends to every type-invisible keyword: `if`/`then`/`else` →
`Then | Else` translations (sound supertype); assertion-only keywords
(`uniqueItems`, `contains` counts, `min/maxProperties`, closedness) →
type-neutral; `dependentRequired`/`dependentSchemas` → union-of-shapes desugar.
The guide's keyword table gains a **static type contribution** column:
narrows-exactly / narrows-to-supertype / validator-only.

## Negation encoding: one internal node, sentinel-carried

`not` travels inside the type as an optional, readonly, unspellable sentinel —
the exact discipline of the format brands
([typeFormat.ts:31-62](../../packages/ts-runtypes/src/runtypes/typeFormat.ts)):

```
StaticBase & {readonly __rtNot?: FromJsonSchema<S_not>}
```

- The prop is `__rtNot`, NEVER `not` — real APIs have fields named `not`; the
  sentinel namespace must be unspellable by accident.
- Optional + readonly keeps mutual assignability with the base (the reason the
  format sentinels are optional).
- It carries the TRANSLATED CHILD TYPE, not schema data — so the Go resolver
  reflects it through the existing type channel: the intersection walker spots
  the `__rtNot` member and builds a negation node whose validator is
  `!(childValidate(v))`. No document consultation needed for `not` at all.
- Structural id folds the child's id plus a `not` tag
  (every annotation param is already id-relevant,
  [typeid/formats.go:392-402](../../ts-go-runtypes/internal/cachegen/runtype/typeid/formats.go)),
  so `string` and `string ∧ ¬email` can never unify in the demand-driven cache.
- One encoding for everything: the public `Not<Email>` IS
  `string & {__rtNot?: Email}`; JSON Schema structural `not` emits the same
  node with a structural child; `if`/`then`/`else` and `dependentSchemas`
  desugar onto it (`anyOf[allOf[if,then], allOf[¬if,else]]`). No second
  spelling, no id fragmentation.
- Known corner: BARE `not` (no sibling `type`) has no base to intersect;
  `unknown & {__rtNot?: T}` collapses to the weak object type, so direct
  primitive assignment (`const v: T = 5`) trips TS's weak-type rule. Validator
  and `validate()`-narrowing flows are unaffected. Wrap the spelling in a
  `NotOf<T>`-style alias so hovers read as intentional; document the corner.

### User-facing negation stays format-scoped

TS authors get `Not<F>` and `RT.not(…)` ONLY over type formats
(`Not<Email>`, `Not<TF.string({pattern})>`, `Not<Integer>`) — a write-site
constraint error anywhere else (`Not<string>`, `Not<{a: number}>`,
`Not<A | B>`). TypeScript cannot reflect general negation, so we do not offer
it as an authoring surface; the general node is internal plumbing reached only
through the schema door. Constraint pitfall for the implementer: the format
sentinels are OPTIONAL, so plain `string` is structurally assignable to
`TypeFormat<string, N, P>` — key the constraint on inferring a real
format-name literal, and pin the misuse set with `@ts-expect-error`.
`BrandName` is stripped (`Not<Email>` is not the `Email` nominal brand).
Mock policy: numeric complements analytic (outside range / +0.5 vs `integer` /
off-multiple); string-family negation rejection-samples from the base
generator with bounded retries, `mockSamples` as the escape hatch (the
`disallowedChars` doctrine,
[stringFormats.ts:78-104](../../packages/ts-runtypes/src/formats/string/stringFormats.ts));
a new FMT code when both fail. Binary: negation nodes emit NO sizer/packing
(base-kind fallback) or `EmitToBinary`/`EstimateBinarySize` desync. JSON codec:
untouched by construction (formats and negation never reach the wire path).

## Where the zero-Go-sees-schema invariant is retired

`not`, desugars, formats and counts all travel through the type channel. A
small residue cannot: `unevaluatedProperties`/`unevaluatedItems` (evaluation
sets across adjacent subschemas) and same-document `$dynamicRef` resolution.
The schema literal ALREADY reaches the resolver as comptime-args data
([runTypeFromJsonSchema.ts:38](../../packages/ts-runtypes/src/json-schema/runTypeFromJsonSchema.ts)),
so the resolver may consult the document for exactly these keywords. The
translation itself stays type-level; convergence is preserved where it should
be: a schema whose meaning is fully type-expressible keeps hashing identically
to its hand-written twin; one carrying validator-only constraints correctly
hashes apart.

## Keyword dispositions (all accepted; column = what each contributes)

| Keyword | Static type | Validator |
| --- | --- | --- |
| `not` | kind-complement ∩ sibling | exact ¬(child) via negation node |
| `if` / `then` / `else` | `Then \| Else` supertype | exact via desugar onto negation node |
| `dependentSchemas` / `dependentRequired` | union-of-shapes (bounded) else base object | exact via desugar |
| `uniqueItems` | neutral | array-format uniqueness check |
| `contains` / `minContains` / `maxContains` | neutral | array-format membership counts against translated subschema |
| `maxItems` | optional-tuple narrowing where bounded (shared bound with `minItems`) | exact length ceiling |
| `minProperties` / `maxProperties` | neutral | object-format key counts |
| `additionalProperties: false` | neutral (TS objects are open) | object-format closedness: undeclared keys rejected |
| `unevaluatedProperties` / `unevaluatedItems` | neutral | exact via static evaluation-set computation (document-consulted); indeterminate dynamic corner = loud build error |
| `patternProperties` | template-literal index signature for the expressible subset; else neutral | exact per-pattern key validation (record node grows pattern-keyed children) |
| `propertyNames` | key-format narrowing for the expressible subset; else neutral | exact key validation |
| `$anchor` | second lookup table beside `$defs` | exact |
| `$id` (root) | ignored | — |
| `$id` (embedded) | base-URI re-scoping for same-document refs | exact resolution; REMOTE refs remain the one true boundary (build-time tool; pre-bundle externally) |
| `$dynamicRef` / `$dynamicAnchor` | resolved statically per document where determinate | exact; pathological runtime-scope recursion = loud build error |
| `$vocabulary`, `$comment`, `deprecated`, `readOnly`*, `writeOnly` | annotations, accepted + ignored (*`readOnly: true` lifts to the TS `readonly` modifier) | — |
| `contentEncoding` / `contentMediaType` / `contentSchema` | annotations per 2020-12 DEFAULT (content vocabulary is non-assertive) | none by default; enforcement is a later opt-in |
| `format` (unknown values) | accepted as annotation (spec default), translated as the base type | not enforced; build Info diagnostic names the unenforced format |
| `format` (the 9 known + fixed `uuid`) | brands as today; `uuid` widens to a NEW version-agnostic UUID format (absorbs filed todo) | enforced |
| `oneOf` / `anyOf` | union (as today) | pin + document the actual EXCLUSIVE union semantics; fix the misleading guide section |

Sibling keywords beside `$ref` / combinators (silently unconsulted today,
[fromJsonSchema.ts:351-353](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts))
become conjunctive intersections — 2020-12 semantics.

## Plan (staged, each milestone independently green)

1. **M1 — negation node (engine).** Protocol + run-type-kind for the `not`
   node; `__rtNot` detection in the intersection/property collapse; typeid
   fold (child id + tag); validate `!(child)`; validationErrors single
   "must NOT match" message; JSON passthrough; binary base-fallback; JS mock
   complement (analytic numeric / rejection-sampling + `mockSamples` hatch +
   new FMT code); stacked-brand guard test (id folds all annotations,
   serialize keeps last — pre-existing asymmetry `Not` must never depend on).
   Go tests per family.
2. **M2 — user-facing `Not<F>` + `RT.not`.** `formats/not.ts` type +
   constraint + misuse pins; builder (structural return-type recognition, no
   registry); format-validation / format-serialization / value-first-define /
   id-integrity rows; both `getRunTypeId` shapes + hash equivalence.
3. **M3 — translation core.** `KindComplement<S>` + `not` emission +
   `ExactJsonSchema` legs; `if/then/else` + `dependent*` desugars;
   sibling-conjunction fix; annotations (`$comment`, `deprecated`,
   `readOnly`/`writeOnly`, `$vocabulary`, root `$id`); unknown-`format`
   annotation policy + Info diagnostic; json-schema-define + compile-budget +
   completion rows.
4. **M4 — format families + structural keywords.** Array formats
   (`uniqueItems`, `contains` counts), object formats (key counts, closedness
   for `additionalProperties: false`), `maxItems`, full `patternProperties` /
   `propertyNames` (record node pattern-keyed children), each with Go emitter +
   gen-type-formats regen + `SchemaStoryByFormatName` rows + mocks + suites.
5. **M5 — references.** `$anchor`; embedded `$id` same-document re-scoping;
   `$dynamicRef`/`$dynamicAnchor` static resolution; document-consulted
   lowering for `unevaluated*`; loud diagnostics for the indeterminate corners
   and remote refs.
6. **M6 — truth + docs + fuzz.** Version-agnostic UUID format; oneOf
   exclusivity pin + guide/source-comment rewrite; guide keyword table becomes
   TOTAL with the static-type-contribution column (hedge sentence deleted);
   compiled examples; ROADMAP/ARCHITECTURE; absorb both filed todos into done;
   fuzz `schemaRender` extension (emit `not` + new keywords over expressible
   positions; structural-id-equality oracle unchanged).

## Done when

- Any syntactically valid 2020-12 document is accepted (remote `$ref` the one
  documented boundary); every keyword enforces exactly or is a spec-blessed
  annotation; nothing drops silently (Info/Warning diagnostics name every
  unenforced annotation).
- Static types follow the tightest-expressible-supertype policy; `never` only
  for proven-empty sets; the guide table is total with per-keyword static
  contribution.
- `Not<F>` + `RT.not(…)` ship format-scoped with write-site misuse errors;
  the union/oneOf docs match the pinned exclusive semantics; both absorbed
  todos moved to done.
- Full `pnpm test` + `go -C ts-go-runtypes test ./internal/...` green; fuzz
  lane green over the widened generator.

## Progress log (updated as milestones land)

- **EFFORT CLOSED 2026-08-02 (M9 drained).** Every milestone M1-M9 shipped on
  feature/json-schema-rollout; the guide keyword table is total, every
  disposition row is implemented or loudly rejected, and the absorbed todos
  live in docs/done. Two OPTIONAL corners stay open by decision, neither
  blocking, split out per the done-or-open convention into
  [json-schema-optional-sugar-corners.md](../todos/json-schema-optional-sugar-corners.md).

- **M9-P7 shipped — fuzz grammar renders the child-schema keywords.** The
  jsonschema convergence lane's grammar now generates `contains` (+
  minContains/maxContains) on arrays and `patternProperties` /
  `propertyNames` on records, rendered on BOTH sides from one shape: the
  schema keywords on the door side and the raw sentinel spellings
  (`__rtContains` / `__rtPatternProps` / `__rtPropNames`) on the type side,
  stacking freely with the arrayFormat/objectFormat bounds. Decisions:
  child pools stay FIXED at the pinned vocabularies ({type: 'number'} child,
  '^n_' pattern, maxLength-3 key names) so convergence failures always mean
  translation drift, never an unpinned combination; the id fold is
  satisfiability-blind, so bound conflicts are allowed (this lane never
  draws values); a grammar-coverage unit pin asserts all three arms fire
  over 400 seeds so a refactor can't silently disable them. Batch + seeded
  soaks run clean.
- **M9-P9 closed — the runTypeFromJsonSchema column drain is COMPLETE, no
  upgradable sentinels remain.** Audit result: format-validation/Realworld
  has zero sentinels; DateTime's are all native Date/Temporal INSTANCE
  types (no JSON input spelling exists, ever); StringFormat keeps 17 real
  thunks and its sentinels are precise non-spellings (custom layouts,
  char-class params, version pins, http/file-only URL variants, sample-less
  patterns); BigintFormat/Currency have no schema spelling by doctrine;
  StructuralFormat's bounded_items/closed_object stay deliberately
  different encodings (P6 decision). CircularGuard keeps its column-less
  case type BY DESIGN — recursive-schema coverage lives in the define
  suites' $ref rows and the composition examples, so plumbing the column
  in would duplicate coverage, not add it.
- **M9-P6 shipped — value-first parity for the structural families** (the
  "special types" green light): `formats/structural.ts` ships the door's
  exact twins as public types + builders, re-exported on the schema surface
  (the `not` precedent): `RT.arrayFormat` / `ArrayFormat` (minItems /
  maxItems / uniqueItems), `RT.objectFormat` / `ObjectFormat`
  (key-count bounds), `RT.contains` / `Contains` (default rt$min 1, bounds
  via {minContains, maxContains}), `RT.patternProperties` /
  `PatternProperties`, `RT.propertyNames` / `PropertyNames`. Three-mode id
  convergence pinned in structuralKeywords.test.ts (builder + type-first +
  reflection against the door), behavior rows in value-first-define, and
  the STRUCTURAL_FORMAT corpus schema columns flipped from 'not-supported'
  to real thunks for the five convergent cases.
  - **Logged decisions**: (1) closedness stays DOOR-OWNED — the `closed`
    param's allowed-key list derives from the schema's own properties (the
    emitter documents it as never hand-authored) and a hand-written list
    disagreeing with the inner shape is a silent footgun; native
    unknown-keys tooling covers the value-first need. (2) bounded_items
    stays door-authored in the corpus: the door lowers minItems to a
    required tuple prefix while the brand carries a minItems param — same
    checks, deliberately different encodings/ids. (3) propertyNames'
    value-first child is string-constrained, so its door twin is the TYPED
    child spelling; a type-less child is the six-kind union per kind
    relevance (its corpus case now uses the typed spelling). (4)
    base64/base32/base16 already have value-first parity via
    TF.string({pattern}) exact params (corpus columns are real); dedicated
    presets, plus a TF spelling for the jsonContent family, stay an open
    sugar corner.

- **M9-P2 shipped — allOf-tuple intersection collapse merge** (absorbed todo
  → [docs/done/allof-tuple-intersection-collapse-gap.md](../done/allof-tuple-intersection-collapse-gap.md)
  with the full merge-algebra decisions): TUPLE ∩ TUPLE members now merge
  slot-wise in both collapse halves (`typeid/tuplemerge.go`; raw picks with
  caller-side optional resolution so the merged id is byte-equal to the
  hand-written tuple's; conflicts / impossible length windows / variadic
  spreads → KindNever, never a silent noop), and `prefixItems` / `items`
  accept boolean subschemas (`true` padding → unknown slot; `false` →
  "no real value here" via the optional-undefined slot; `items: true` =
  open tail). Go collapse-level pins in `typeid/tuplemerge_test.go`; door
  pins + marker twins in structuralKeywords.test.ts; the M5
  unevaluatedItems merged-prefix row restored in referencesUneval.test.ts.
  - **Small open corner (recorded)**: boolean subschemas in the REMAINING
    schema positions (`anyOf` / `oneOf` / `allOf` members, `properties` /
    `$defs` / `patternProperties` values) still reject at the input type;
    the core ladder already handles booleans, so each is an input-type +
    Exact-leg widening when wanted (the `ExactJsonSchemaList` boolean
    skip is already in place for list positions).

- **M1 shipped** (`86881a2`): negation nodes end-to-end (collapse lifts, id
  folds, inverted validators, scratch-probe verr, mock rejection sampling).
- **M2 shipped** (`f780888`): `Not<F>` + `TF.not`/`RT.not`, write-site misuse
  pins, runtime cache emission fix (module.go field + bundle slot 14).
- **M3 shipped** (`38f9060`, `c51016d`, `e6a9180`): `not` keyword with
  kind-complement statics; if/then/else + dependent* desugars through the
  distributive Conj; sibling conjunction for $ref/combinators/const/enum;
  same-family format-annotation MERGING in Go (loud failure on unmergeable
  stacks, replacing silent last-wins); annotations, unknown formats, root
  $id/$vocabulary; `required` without `properties` (PresentValue marker).
- **Fuzz coverage shipped** (pre-M4, user-requested): the wild type generator
  (`test/fuzz/core/typeGen.ts`) grew `format` / `not` leaves (7-entry
  FORMAT_LEAVES vocabulary — email/uuid named brands + keyword-derived
  string/number constraints — with valid/counter pools and a reference
  predicate), rendered through an IMPORT-FREE structural-alias preamble so
  fixtures compile under tsValidate's bare host and the harness virtual
  filesystems; the jsonschema lane renders the sibling-typed schema twin of
  every leaf (`{type, not: {…}}` for negations) and its Email stand-in shares
  one pattern constant with the preamble. Value lane: pool-driven
  valid/counter values, base-kind-disjoint corruptions; negation leaves are
  size-lane-ineligible (respectBinarySize shrinks the mock distribution out
  of the complement). All lanes smoke-green; leaf params sized so negation
  rejection sampling can't flake (minLen50, not minLen3). Incidental finding
  filed: [tb-noop-predicate-class-stripped-members.md](tb-noop-predicate-class-stripped-members.md)
  (pre-existing, exposed by the reshuffled seed stream).

- **Presence-marker fix shipped** (post-M3 defect found by a live double-check):
  `PresentValue` was `{} | null`, which the engine compiles as an
  object-or-null member check — so `{type:'object', required:['zip']}`
  REJECTED `{zip:'12345'}` (and the same marker broke dependentRequired /
  dependentSchemas standalone keys and `required`-only negation children).
  Now the six-kind JSON domain; regression rows in conditionals.test.ts
  ("presence markers accept every JSON value") + notKeyword.test.ts
  (structural negation rows).

- **Bare-`not` kind-relevance rework shipped** (the former OPEN DEFECT — all
  four located root causes fixed, plus three engine defects the rework
  unmasked):
  - `NotLayer` escape no longer counts owned/upper-layer keys: the routing
    key set is `CoreValueKeys` (enum/const/combinators/$ref), so `NotApplied`
    is reachable again and `if`/`dependent*` siblings stay with their own
    layers.
  - `NotArm` reworked per the analytic table: typed child → outside-gate
    kinds plain, in-gate sentinel'd/excluded; TYPE-LESS child →
    constrained-family kinds sentinel'd, every untouched kind EXCLUDED
    (vacuous match); value-scoped child → all four sentinel-capable kinds
    sentinel'd. Sentinel children are FAMILY-PROJECTED (`GateArmFrom<K, NS>`)
    when the child has no value-scoped keys — exact under kind relevance,
    single-kind for the Go negation compile, and id-convergent with `Not<F>`
    (pinned: bare `{not:{pattern}}` ≡ `Not<TF.String<{pattern}>>`).
  - null/boolean arms are decided by **AcceptsLit** — a fuel-bounded (4-hop)
    three-valued static walk over the child SHAPE (type gate + const / enum /
    anyOf / oneOf-one-hot / allOf / nested not / if-then-else / $ref through
    Root) since those literals cannot carry the sentinel and no family
    keyword discriminates them. Undecidable verdicts (the liar schema
    `{not:{$ref:'#'}}`) poison the negation to `never`, loudly; fuel 4 keeps
    the degenerate cycles under tsc's TS2589 wall.
  - The Core∧sentinel fallback narrowed to genuinely-lazy outers
    ($ref/combinators beside `not`, verbatim intersection); const/enum outers
    DISTRIBUTE the sentinel over the literal union with the same verdicts
    (`{enum:[3,7,null], not:{const:3}}` → `(3&¬3)|(7&¬3)|null`).
  - Engine fix 1 — the validate emitter spliced Negations only onto CodeE
    bases, silently DROPPING the ¬ for statement-bodied kinds (array / tuple /
    object literal). Statement bases now hoist through the tier-3 ctxFn wrap
    (`EmitContext.AsExpression`) and AND-chain, with a loud panic if a base
    can't reduce.
  - Engine fix 2 — the bare `object` keyword (TypeFlagsNonPrimitive) was
    dropped by BOTH intersection-collapse halves' member classification, so
    `object & {__rtNot?: …}` lost its base (validate degraded to `!(child)`).
    Both halves now classify it; the single-base path projects KindObject.
  - Engine fix 3 — mock-side: `negationChildMatches` treated every tuple as
    CLOSED (long arrays "didn't match" an open `[A, B, ...rest]` child and
    slipped through sampling), and the Go tuple wire form (`tupleMember` +
    `flags:['rest']`, element as direct child) wasn't recognized as a rest
    member anywhere in the mock walker. Union mocks also fall through to a
    sibling arm when one arm's rejection sampling exhausts (a provably-empty
    negated arm like `3 & ¬3` must not fail the whole union); an explicit
    `unionIndex` still throws.
  - Translation exactness fixes riding along: keyword-less object gates are
    `Record<string, unknown>` (TS `object` admits arrays — wrong for JSON
    Schema's object kind and corrupting for ¬); `minItems` beyond/without
    `prefixItems` PADS the tuple with `PresentValue` members (`unknown`
    members enforce nothing, so `{type:'array', minItems:2}` accepted `[]`).
  - Coverage: the kind-relevance matrix in notKeyword.test.ts (type-less ×
    typed × value-scoped children, null/boolean edges, sibling/enum outers,
    minItems pad, mock soundness loops, Not<F> convergence through both
    marker shapes) + a `not` instantiation-budget row (net 4204).

- **M4.1 shipped — structural format families + five keyword rows**:
  - Go `formats/structural`: **arrayFormat** (registered under BOTH array and
    tuple kinds; params minItems / maxItems / uniqueItems — uniqueItems is
    the 2020-12 deep-equality scan via a self-contained canonical-stringify
    IIFE, numbers compare mathematically so `[0, -0]` is a duplicate) and
    **objectFormat** (objectLiteral + bare `object` kinds; params
    minProperties / maxProperties / closed — closed carries the ALLOWED-key
    list from the schema's own `properties`, so `additionalProperties: false`
    without properties admits only `{}`). Both AOT-validate bound
    contradictions.
  - Emit hosts: the validate format splice now HOISTS statement-shaped bases
    (the same tier-3 ctxFn treatment negations got — the pre-recorded
    landmine); verr's baseKindGuard gained array/tuple/objectLiteral/object
    arms so wrong-kind values report the base error instead of throwing on
    `.length` / `Object.keys(null)`.
  - Both intersection-collapse halves lift structural brands beside the
    negation sentinel in the object-only path (single non-sentinel base →
    base kind + FormatAnnotation / `Compute(base) + formatKey`; merged path
    appends the format key and both property walks skip the brand sentinels
    by name — `IsFormatSentinelPropName`).
  - gen-type-formats: kindJsName grew array/tuple/object/objectLiteral rows,
    same-name multi-kind families dedupe to one name-keyed row with a
    deterministic (name, kind) sort, and the sync test accepts any of a
    family's registered kinds. `FormatName` += arrayFormat / objectFormat;
    SchemaStoryByFormatName rows added (totality holds).
  - Translation: `uniqueItems` / `maxItems` ride the arrayFormat brand over
    whatever tuple/array shape the OTHER keywords produce (minItems keeps
    its padded-tuple spelling); `minProperties` / `maxProperties` /
    `additionalProperties: false` ride objectFormat (closed key list via
    KeysToTuple). Family key lists grew, so kind-relevance negation gating
    covers the new keywords (`{not: {uniqueItems: true}}` accepts exactly
    the duplicate-carrying arrays).
  - Mocks: shared `structuralFormat.ts` twins (canonicalJson must agree with
    the Go IIFE), mockSwitch reject-samples structural annotations, the
    array case clamps length and fills unique-aware, tuples dedupe/truncate
    post-draw, records trim/top-up index keys into the key-count bounds, and
    negationMatch tests the new params honestly on all four structural arms.
  - Coverage: `structuralKeywords.test.ts` (17 rows: deep-equality corpus,
    tuple/typed-items composition, verr rows, closedness, negation rows,
    mock loops, marker-rule pair on the raw-sentinel spelling) + compile
    budget row (net 2343) + the `not` budget re-ratchet (4276, the grown
    family key lists) + the `_06` closedness pin flip.
  - Still M4.2: contains / minContains / maxContains (child-schema slots),
    full patternProperties / propertyNames.

- **M4.2 shipped — child-schema keywords (M4 COMPLETE)**:
  - **contains / minContains / maxContains**: new protocol slot
    `Contains []*ContainsCheck` fed by the `__rtContains` sentinel
    (`{rt$child; rt$min; rt$max?}` — bounds cannot ride format params, the
    child is a validator). Both collapse halves lift it (id fold
    `c{childId:min:max}` sorted), EachRefSlot walks the children, the module
    emitter carries entries through BOTH layouts (the bundle-specials
    predicate gates residual footers — extending it was the missing wire the
    first probe caught), validate counts matching items via an
    element-accessor loop, verr probes per item with the scratch-error trick
    and reports one error per violated bound. `rt$child` reads RAW
    (GetNonNullableType degrades an `unknown` child — `contains: true` — to
    `{}`). Booleans per spec: true needs any item, false rejects all arrays;
    min/maxContains WITHOUT contains are annotations (NonKindKeys). Mocks
    construct: min child-mocks per entry + fillers the loose matcher
    DEFINITIVELY rejects; tuples give up loudly; negation sampling shrinks
    its collection draws in the back half so ¬contains cannot exhaust.
  - **patternProperties**: `PatternProps []*PatternPropCheck{Source, Key,
    Value}` from the `__rtPatternProps` sentinel whose PROP NAMES are the
    regex sources and prop types `{rt$key: pattern-branded string; rt$value:
    translation}` pairs — the key brand exists so the build-time pattern
    sample pools reach the runtime for key mocking; the id folds
    `pp{"source":valueId}` (key brand id-neutral). Validate: hoisted regex +
    per-key loop over the value child; verr: canonical error per pattern.
    `additionalProperties: false` beside patternProperties adds a
    `closedPatterns` param — closedness admits pattern-matching keys per
    2020-12. Mocks regenerate matching keys' values from the pattern's own
    child, add one pooled key per pattern, and DROP keys matching two
    patterns (no sound single-child generation for overlaps).
  - **propertyNames**: single `PropNames` child slot (`__rtPropNames`);
    every key validates as a string against the child (a type-less child is
    the six-kind union, so string constraints apply by kind relevance —
    exact for keys). Booleans: true no-op, false admits only `{}` (never
    child). Mocks re-key undeclared keys from the child's own mock.
  - Disk-cache note: the resolver cache fingerprint does NOT include the
    binary build, so mid-development emitter changes can serve stale entries
    for unchanged ids — `rm -rf node_modules/.cache/ts-runtypes` when
    validating emitter work (cost an hour in this slice).
  - Coverage: 8 new describes in structuralKeywords.test.ts (34 rows total:
    bounds/booleans/annotation corners, closedness interplay, negation rows,
    mock loops, raw-sentinel convergence pairs) + budget ratchets
    (not 4332 / structural 2409 / ExactJsonSchema 799).

- **M5 shipped — references + unevaluated\***:
  - **$anchor / $dynamicAnchor / $dynamicRef**: `$ref: '#name'` resolves a
    same-document anchor ($dynamicAnchor also registers as a plain anchor
    per spec); `$dynamicRef` resolves the same table statically — one
    schema resource means one dynamic-scope candidate, so the late-bound
    semantics collapse to a lookup. Unknown anchors resolve never, anchors
    converge with the `#/$defs/` pointer spelling (pinned), the root's own
    anchor re-enters the fixpoint tuple lazily, and AcceptsLit mirrors the
    whole table (anchored/dynamic not-children keep exact null/boolean
    verdicts).
  - **unevaluatedProperties / unevaluatedItems**: `false` lowers to the M4
    closedness machinery over the STATICALLY determinable applicator set —
    own keywords plus allOf members, recursively (allOf-contributed
    properties and patternProperties join `closed` / `closedPatterns`;
    additionalProperties: false stays stricter and wins when both appear).
    unevaluatedItems closes at the longest merged prefix via the maxItems
    param (items in scope → no-op per spec). Instance-dependent scopes —
    if / dependentSchemas / anyOf / oneOf / $ref / $dynamicRef in scope,
    contains for the items flavor, or schema-valued unevaluated\* — POISON
    to never, loud over lossy (the AcceptsLit 'u' doctrine); `true` is a
    no-op.
  - Incidental finding filed:
    [allof-tuple-intersection-collapse-gap.md](allof-tuple-intersection-collapse-gap.md)
    — allOf over prefixItems members collapses tuple ∩ tuple to a noop
    validator TODAY (pre-existing, independent of unevaluated\*); the
    merged-prefix unevaluatedItems row stays untested until it closes.
  - Coverage: referencesUneval.test.ts (13 rows: anchor resolution ×
    pointer convergence × unknown-anchor poison, allOf-merged closedness,
    poison rows, mock loops, marker pair) + budget ratchets (not 4721 /
    structural 2439).

- **M8 shipped — the new formats join the validation corpus, serialization,
  and the fuzz type generation** (user-directed):
  - **Corpus**: StringFormat gained base64/base32/base16/jsonContent rows
    (static twin = the door-recovered FromJsonSchema type, so id-integrity
    pins schema↔type-first by construction; the encodings also carry REAL
    value-first twins via TF.string pattern params with the door's exact
    baked pools). NEW STRUCTURAL_FORMAT group (+ runner): uniqueItems,
    minItems/maxItems, key counts, closedness, contains,
    patternProperties, propertyNames, oneOf, anyOf — full case matrix
    including DataOnly and deserialize twins; oneOf/anyOf also ride the
    serialization corpus (Unions.ts) with REAL jsonSchema
    encoder/decoder/binary twins (wire-neutrality: no special
    serialization behavior, byte-identical to the plain union).
    Payload truth pinned along the way: minItems lowers to a required
    tuple prefix (missing-element error, no format payload); only
    maxItems rides the arrayFormat brand.
  - **Fuzz**: FORMAT_LEAVES gained base64 + jsonContent (full value-lane
    citizens, dense complements for the negation lanes; preamble twins
    spell the door's params EXACTLY). Under the new
    `GenOptions.structuralFormats` (jsonschema lane only — the value
    lanes' generators don't enforce the constraints): arrays/records draw
    arrayFormat/objectFormat params, and exclusive (oneOf) unions
    generate over disjoint-by-construction branches; both render as RAW
    sentinel spellings + the matching keywords, covered by the
    id-convergence oracle over 100 seeds.
  - **Two engine bugs the new coverage caught (both fixed here)**:
    (1) DataOnly over sentinel-branded containers SEGFAULTED the resolver
    (mapped hybrid passes IsArrayLikeType with no TypeReference target →
    GetTypeArguments nil-deref) and mangled the brand besides. Fixed
    twice over: DataOnly keeps sentinel-carrying containers verbatim via
    shape-filtered probes (a string INDEX SIGNATURE absorbs the sentinel
    keys from keyof, and indexing a record returns the value type — each
    probe filters on the sentinel's value shape, false positives limited
    to inherently-clean value shapes), and both Go array branches gained
    the ObjectFlagsReference guard so NO mapped hybrid can ever segfault
    again. Residual: __rtNot on a RECORD base has no shape-filterable
    probe (the child is arbitrary), so record-based negation under
    DataOnly stays divergent rather than risking silent value-stripping.
    (2) OneOf carrier detection keyed carriers by tuple POINTER identity;
    in a large written type tsgo does not intern two spellings of the
    identical tuple literal, the level read as ambiguous, and the
    exclusivity SILENTLY DROPPED (8/100 fuzz seeds). Detection now
    dedupes by the checker's canonical type print; the reduced fixture is
    pinned in oneOfAnyOf.test.ts (carrier interning regression).
  - **Residual (narrowed)**: the fuzz grammar still does not emit
    contains / patternProperties / propertyNames (child-schema rendering
    on both sides; the corpus carries dense hand-written rows for them),
    anchors, or dependent keywords.
  - **Small open corners — ALL THREE RESOLVED in M9-P3/P4/P5**:
    - oneOf mock (P4): `mock.unionIndex` now picks the BRANCH (the tuple as
      written — the author call, range-checked, loud throw when the pick
      cannot land exclusively, no silent fallback), and the attempt budget
      scales with width (`max(32, branches × 4)`) so rotation reaches every
      branch past 32; pinned with a 34-branch row (33 duplicates + one
      satisfiable) in oneOfAnyOf.test.ts.
    - The all-nullish degenerate (P3): a DUPLICATED nullish branch now
      resolves never in both arm formulas (`OneOfArm` / `OneOfArmFrom` —
      kept in lockstep; the nullish-dup walk only instantiates for nullish
      arms so the O(1) common path is untouched):
      `oneOf: [{type:'null'}, {type:'null'}]` and `OneOf<[null, null]>` are
      never; the mixed case keeps the duplicates in the branch tuple so
      runtime counting rejects null by double-match while the real branch
      survives. A nullish value hiding inside a union-VALUED branch stays a
      type-level over-approximation (runtime counting already rejects it) —
      the same accepted class as indexed-access subtype reduction.
    - verr message polish (P5): the mechanical Standard Schema message
      drops uninformative bound clauses — a WILDCARD bound ('any') names
      the format itself ("Failed uuid constraint"), an ECHO bound
      (`pattern (pattern)`) drops the parens; informative bounds
      (`maxLength (5)`) are untouched. Structured `format` payloads stay
      lossless; issueMapping.test.ts pins all three shapes.
    - DataOnly record-negation divergence (P3 investigation, decision:
      KEEP): `__rtNot` carries an arbitrary child, so no value-shape probe
      can discriminate it behind a string index signature without false
      positives, and re-encoding the record-not child in a marker wrapper
      would break shipped ids for a corner needing record ∧ negation ∧
      DataOnly simultaneously. The chosen direction is safe (the validator
      stays STRICTER than the DataOnly type — never silent
      value-stripping) and stays documented in dataOnly.ts.

- **M7 shipped — OneOf/AnyOf combinators (resolves the M6 ⚠️ union flag)**:
  the user re-ruled: plain unions and anyOf STAY at-least-one; oneOf gains
  real exactly-one enforcement as a first-class combinator with the same
  names across all three modes (`OneOf<[…]>`/`AnyOf<[…]>` types,
  `RT.oneOf`/`RT.anyOf` builders, JSON `oneOf`/`anyOf`).
  - **Encoding (the part that fought back, TWICE — final form M7.1)**: the
    sentinel-slot recipe used by the four M4/M5 slots does NOT work over a
    union base — the checker DISTRIBUTES `(A | B) & S` into
    `(A & S) | (B & S)` at intersection construction, and a `null` branch
    is destroyed outright (`null & S` reduces away — fatal for the
    nullable-via-oneOf idiom). The first replacement (an extra UNINHABITED
    tag member `{__rtOneOf: Bs; __rtUninhabited: never}`) fixed null
    branches but broke plain-union CONSUMPTION, caught by type-level
    probes when the user asked for acceptance tests: `u.kind` on a
    discriminated OneOf errors (the tag lacks the prop — kills the OpenAPI
    discriminator idiom), `OneOf<[A,B]>` does not widen to `A | B`, and
    typeof-narrowing leaves a phantom arm. FINAL encoding: per-member
    CARRIERS — every non-nullish member intersects
    `{readonly __rtOneOf?: Bs}` (OPTIONAL prop, so each member stays
    mutually assignable with its plain form), nullish branches left plain
    (any one surviving carrier provides the tuple). Construction (M7.2
    simplification, user-requested): ONE shallow mapped type + indexed
    access — O(1) instantiation depth, no recursion wall at any width
    (40-branch row pinned) — with the per-arm nullish check in a
    naked-parameter helper so it DISTRIBUTES into union-valued branches
    (their null stays plain; pinned). The indexed access may subtype-reduce
    a redundant TYPE arm, which costs only the hover — the carrier tuple is
    what the validator counts. The one real consequence is pinned and
    handled: IDENTICAL branches intern to one arm, the union dedups away,
    and the standalone carrier'd intersection must project the degenerate
    one-member union with counting (duplicate-branch-id check in BOTH
    collapses; multi-base + duplicate → never, loud) instead of silently
    degrading to the plain base. All six consumption-DX probes pass:
    switch(u.kind), widening to `A | B`, clean typeof narrowing, null
    narrowing, acceptance, distributive-conditional survival — promoted
    into oneOfAnyOf.test.ts. Go detection: `OneOfFromMembers`
    (typeid/formats.go) scans union members' intersection constituents for
    the 1-prop carrier AND the merged-prop shadow (homomorphic projections
    like DataOnly merge the intersection into one object — the tuple then
    survives only as the `__rtOneOf` prop; the `__rt` prefix is the
    reserved sentinel namespace); nested OneOf branches flatten their
    inner carriers into the outer member list, so the level carrier is the
    one no other carrier's branch flattening contains (claim rule over
    tuple-type identity). Both collapses skip the carrier at
    CLASSIFICATION time (members serialize/hash as their plain selves on
    every downstream path — primitive brand, builtin class, object merge)
    and the merged prop walks skip `__rtOneOf` by name. The union node
    carries `node.OneOf` / an `oo{sorted branch ids}` id suffix.
  - **Runtime**: union validate with branches present REPLACES the
    OR-chain with a counting IIFE (`n === 1`); each branch re-wraps the
    object guard `emitObjectValidate` drops under a union parent (the
    OR-chain's shared guard doesn't exist on the counting path — this
    crashed on null until mirrored) plus the weak-type looseCheckGate.
    verr keeps the validate-fn delegate for detection and re-probes
    branches against scratch error arrays only inside the failure block:
    matched-none → the canonical union error, matched-several → one
    canonical FormatErrCall entry `{name: 'oneOf', formatPath: ['oneOf'],
    val: <count>}`. Mocks draw a branch and reject candidates a second
    branch also matches (32 attempts, rotation, loud exhaustion throw);
    negationMatch counts branches for oneOf nodes. noop gates extended.
  - **Semantics pinned**: grouping (`oneOf: [A, {anyOf: [B, C]}]` — a b+c
    value matched ONE branch, passes), nested OneOf, null branch, duplicate
    branches (statically unsatisfiable — counting reports it naturally,
    everything fails), single-branch oneOf normalizes to the branch, empty
    oneOf → never, three-mode id convergence + marker pairs
    (oneOfAnyOf.test.ts, 19 rows). The M6 truth pin FLIPPED: a two-arm
    match passes anyOf and now fails oneOf.
  - **Loud corners**: `oneOf` beside constraining siblings (type gate,
    second combinator, family keywords, $ref) resolves never — the
    conjunction would need `T & (A | B)` shapes the collapse cannot
    classify, and silently dropping exclusivity is the one forbidden
    outcome; same for a oneOf-bearing arm inside a multi-arm allOf. Guide
    documents the fix (push the shared constraint into every branch).
  - **Residual**: the jsonschema fuzz grammar still emits anyOf only;
    emitting oneOf over union positions (with the OneOf twin in the
    type-first fixture) joins the existing fuzz-grammar residual. The
    matcher note: a loose branch over-match can flip exactly-one to false
    in negationMatch (wasted retry in mocks; the rare oneOf-under-negation
    path stays policed by validate(mock()) suite rows).

- **M6 shipped — truth, UUID, content keywords, docs, absorptions**:
  - **UNION SEMANTICS (superseded by M7 above).** The M6-era empirical
    finding stands for PLAIN unions and anyOf (at-least-one, pinned); the
    then-documented oneOf widening was replaced in M7 by real exactly-one
    enforcement per the user's re-ruling.
  - **uuid version-agnostic** (absorbed todo → docs/done): `format: 'uuid'`
    recovers the new `UUID` brand (`{version: 'any'}` — pf_isUUID treats
    slot 14 as hex under 'any'); `TF.uuid` preset ships beside uuidv4/v7;
    v1/v3/v7 acceptance pinned.
  - **content keywords**: contentEncoding base64/base32/base16 lower to
    anchored RFC 4648 pattern params (sample pools baked, full pattern
    machinery free); contentMediaType application/json is the new
    jsonContent family (parse-check IIFE, atob-decoded when
    contentEncoding: base64 rides alongside; sibling string params fold
    into the SAME annotation so no cross-family stack reaches the
    collapse). Loud corners: user pattern beside an encoding, named format
    beside a media type, and base32/base16-encoded JSON (no runtime
    decoder) all resolve never; contentSchema stays rejected at the key.
  - **patternProperties/maxItems todo absorbed** → docs/done with shipped
    notes.
  - **Docs**: the guide keyword table is TOTAL (hedge sentence gone; loud
    rejections listed with reasons; version-agnostic uuid noted; union
    truth in Things worth knowing); ARCHITECTURE describes the sentinel
    slots + structural families and the union pin; ROADMAP's JSON Schema
    row records the full coverage and the one Go-side addition class.
  - **New findings filed**:
    [json-schema-format-sibling-params-dropped.md](json-schema-format-sibling-params-dropped.md)
    (pre-existing — named format beside length keywords drops them) and
    [allof-tuple-intersection-collapse-gap.md](allof-tuple-intersection-collapse-gap.md)
    (from M5).
  - **Residual (nice-to-have, not blocking)**: the jsonschema fuzz grammar
    does not yet emit the new structural/content keywords (the define
    suites carry ~90 hand-written rows for them); extending
    schemaRender.ts + preamble twins is follow-up polish.
  - Final budget ratchets after the content branches: objects 2697, not
    4756, structural 2448 (composite pins `id: UUID`).
  - **uuid-any fallout reconciled across the test estate** (the full-suite
    gate caught three classes the slice itself didn't): (1) the Go
    `ValidateParams` gate (formats/string/uuid.go) still rejected
    `version: 'any'` with FMT002 — a loud spurious diagnostic on every
    TF.UUID site even though the emitted validator was already correct;
    now accepts '4' / '7' / 'any'. (2) The format-validation corpus paired
    `format: 'uuid'` with TF.uuidv4 — replaced by a NEW version-agnostic
    `uuid` row carrying the JSON Schema twins (v4/v7 both valid,
    val 'any'), uuidv4's schema twins became 'not-supported' (no schema
    spelling pins a version now), and the REALWORLD User/Order cases
    flipped to TF.UUID so the only realistic-DTO convergence coverage
    survived. (3) The jsonschema fuzz harness's virtual module still
    declared a `UUIDv4` stand-in while the live-sliced extract now
    references `UUID` — the unresolved name silently degraded the
    schema-side id instead of failing the harness typecheck (the id
    oracle caught it anyway); stand-in updated, FzUUID preamble +
    oracle regex widened to any-version.

### M4 implementation notes (for the next session)

- Emitter template confirmed: mirror
  [formats/string/stringformat.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/string/stringformat.go)
  — implement `Name()` + `Kind()` + `EmitValidateCheck` (AND-joined
  expressions) + `EmitValidationErrorsCheck` (`if (fail) FormatErrCall(...)`
  statements) + optional `ValidateParams`; register from `init()` and
  blank-import the package from
  [formats/all](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/all/).
  Registry key is (Kind, Name) — objectFormat registers TWICE (objectLiteral
  and record kinds) via two thin structs sharing one condition builder.
- `pnpm rtx core codegen typeformats` regenerates `FormatName` FROM the Go
  registry (blank-imports formats/all, enumerates `Registered()`), so the TS
  union grows automatically once the emitters land; SchemaStoryByFormatName
  rows must be added in the same change or `pnpm run lint` fails totality.
- Validate/verr hosts splice `FormatAnnotation` only when the base emits
  CodeE (validate) / CodeS (verr). Array and objectLiteral bases emit
  CodeRB/CodeS statement bodies — the validate host needs the SAME
  `AsExpression` hoist treatment for FormatAnnotation that Negations got in
  the bare-`not` rework (validate.go currently skips the format splice for
  non-CodeE bases; that silent skip becomes load-bearing the moment array
  formats exist).
- Collapse lift: the object-only intersection paths in BOTH halves lift
  `__rtNot` sentinels today; the structural brands need the SAME lift
  (`FormatAnnotationFromType` beside `NotChildTypeFromMember`) so
  `unknown[] & ArrayFormatBrand` projects array + FormatAnnotation instead
  of a merged objectLiteral. The single-base∧sentinel branch and the
  NonPrimitive (`object` keyword) special case are already in place from
  the bare-`not` rework — extend them, don't re-derive.

- Structural-base formats attach exactly like the negation sentinel: extend
  BOTH intersection-collapse halves' object×object paths to lift
  `FormatAnnotationFromType` members when a single non-sentinel base remains
  (arrays/records/object literals), mirroring the single-base∧sentinel fix.
- New Go package `formats/structural`: `arrayFormat` (Kind array; params
  uniqueItems/maxItems/minItems) and `objectFormat` (register under BOTH
  objectLiteral and object kinds; params minProperties/maxProperties/closed).
- `closed` carries the allowed-keys LIST (params arrays serialize fine);
  translation computes it type-level via the existing KeysToTuple.
- uniqueItems is DEEP equality per 2020-12: emit a self-contained IIFE with
  sorted-key canonical stringify (email.go's IIFE precedent) — no pure-fn
  registration needed.
- gen-type-formats regen grows FormatName → SchemaStoryByFormatName totality
  in fromJsonSchema.ts must gain rows in the same change.
- contains/minContains/maxContains carry CHILD SCHEMAS — params cannot hold
  validators; give them a Negations-style node slot (M4.2), then
  patternProperties/propertyNames full acceptance (record node pattern-keyed
  children).
