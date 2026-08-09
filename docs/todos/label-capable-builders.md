---
type: feature
spec: full-plan
status: ready
created: 2026-08-09
---

# Label-capable tuple and function builders (object form)

## Problem

Tuple element labels and function parameter names fold into the structural id
(typeid.go:485-531 — "label data lives on the node, so the label is part of
what the node IS"; tupleLabels.test.ts), but `RT.tuple` / `RT.func` can only
express unlabeled/unnamed shapes, so builder-authored types diverge from
their type-first twins (pinned: callableBuilder.test.ts:9-13, validation/
Tuple.ts `tuple_named_labels` `idDivergent: true`) and the convert CLI
refuses labeled tuples on the builders and json-schema targets
(internal/convert/print.go, both refusals say "label-capable builders
pending"). DECIDED DESIGN (2026-08-09): the builders gain an object-literal
form — `RT.tuple({x: RT.number(), y: RT.number()})` — where the object keys
become the labels and JS key insertion order defines slot order.

## Design

**API surface** (new overloads beside the array forms, which stay unchanged):

    RT.tuple({x: RT.number(), y: RT.number()})            // [x: number, y: number]
    RT.tuple({x: RT.number()}, {y: RT.number()})          // [x: number, y?: number]
    RT.tuple({x: RT.number()}, {}, RT.string())           // [x: number, ...rest: string[]]
    RT.func({event: RT.string(), retries: RT.number()}, ret)  // (event: string, retries: number) => R

Labels are always valid identifiers (TS tuple-label grammar), so object keys
can spell every label. Numeric-looking keys cannot occur for the same reason
(JS would also reorder them — worth one negative test).

**Mechanism — the `__rtLabels` sentinel.** Structure reaches the Go side
ONLY through the resolved type of the `InjectRunTypeId<T>` marker parameter
(builders.go:6-11; scan.go:453-530); there is no call-site-AST channel for
structure, and TypeScript cannot CONSTRUCT labeled tuple types by mapped
types. The intended mechanism is already designed and recorded
(docs/done/format-conversion-layer.md:134): the carried type is the
unlabeled values tuple intersected with a sentinel that carries the labels
as a literal string tuple —

    RunType<[number, number] & {readonly __rtLabels?: readonly ['x', 'y']}>

— and the Go side lifts the sentinel exactly like the `__rt*` schema-check
sentinels (never surfaces as a property; folds into the id; populates
`TupleMember.Name` / `Parameter.Name`):

- typeid: fold the sentinel labels the same way ElementInfo labels fold
  today (typeid.go:485-531), so the object-form id equals the type-first
  labeled-tuple id.
- serialize: write the names onto the projected members, twin of the
  `LabeledDeclaration()` read at serialize.go:1040-1048.
- The sentinel member is stripped from the property walk (same three-part
  contract documented on reflection.SchemaChecks).

**Type-level ordering.** The values tuple and the keys tuple derive from the
SAME key order via `KeysToTuple` (already exists:
json-schema/fromJsonSchema.ts:1730-1732, used by compose.ts:574) plus a new
values twin. Checker evidence for order stability: fresh object-literal
properties sort by declaration position (checker getNamedMembers →
sortSymbols → compareSymbolsWorker), and mapped types LINK declarations only
when NOT `as`-remapped (checker.go:20805; the ObjectType profile split in
builders/static.ts:74-138 is the in-repo precedent) — so the builder generic
must stay homomorphic/non-remapped. Key-union order for fresh literals is
declaration order in practice but not spec-guaranteed: this is THE risk of
the design, so it is pinned by adversarial tests (5+ keys ordered against
alphabetical, repeated shapes, cross-file duplicates) and the id oracle.

**Also fix while here — the func projection gap.** typeid already expands a
labeled rest-tuple parameter into named positional params
(typeid.go:804-822) but the serializer does NOT (projectSignatureInto walks
`signature.Parameters()` verbatim) — so a labeled value-first func and the
written call signature share an id yet project different `Parameters`
(first-interned wins). Mirror the expansion in serialize so the projection
matches the id's view.

**Convert printers switch** (internal/convert/print.go):

- builders target: labeled tuple → the object form (labels are on
  `KindTupleMember.Name`; `tupleMembers` currently discards the strings —
  return them); named functions → the object-params form, replacing the
  `getRunType` escape where labels exist.
- json-schema target: labeled tuples → `embedType<[name: string, age:
  number]>()` (the type printer already spells labels; id-exact; dialect,
  so `--portable` refuses). NO `jsLabels` door keyword — that decision
  stands (docs/done/format-conversion-completion.md, "Deliberately not
  carried forward").

## Tests

- Convergence pins (features/): object-form tuple id === type-first labeled
  id, and object-params func id === written call-signature id — BOTH
  `getRunTypeId<T>()` and `getRunTypeId(value)` shapes (marker coverage
  rule).
- Order-adversarial pins: 5+ keys ordered against alphabetical; two
  same-shape/different-labels object forms stay distinct; numeric-looking
  key rejected (type error pin).
- The EXISTING divergence pins stay: the array/positional forms remain
  unlabeled by design (callableBuilder.test.ts, Tuple.ts `tuple_named_labels`
  keeps `idDivergent` for the ARRAY spelling); add the converging twin cases
  for the object forms (flip `jsonSchemaIdDivergent` only where the embed
  spelling now converges).
- Convert chain tests: labeled tuple and named function through
  type → builders → json-schema → type with the id + C6 oracles; labeled
  fuzz arms in the convert sweep generator.
- Go: typeid/serialize sentinel tests incl. the func expansion parity
  (projection equals the id's positional view).

## Docs

Website type-builders guide (the object form, one example), the convert
guide's "What converts" list (labeled tuples move from the refusal note to
supported), ROADMAP.md:194 (the label line resolves to this todo, then to
shipped), FUZZING.md if arms land.

## Out of scope

A `jsLabels` schema keyword; reading labels from the call-site AST (no such
channel exists and the sentinel route needs none); changing or deprecating
the array/positional overloads; enum-builder nominal metadata (separate,
pre-existing divergence).

## Done when

`getRunTypeId(RT.tuple({x: TF.number(), y: TF.number()})) ===
getRunTypeId<[x: number, y: number]>()` (and the func twin) hold as pinned
tests; the convert CLI converts labeled tuples and named functions on all
three targets with unchanged ids and C6-equal graphs; the order-adversarial
pins hold; full Go + JS suites, lint, format green.
