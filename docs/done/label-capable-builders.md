---
type: feature
spec: full-plan
status: done
created: 2026-08-09
completed: 2026-08-09
---

# Label-capable tuple and function builders (slot form)

> **Shipped with ONE design change** on `feature/format-conversion-layer`.
> The spec below was filed with an object-literal spelling
> (`RT.tuple({x: RT.number(), y: RT.number()})`, key order = slot order) on
> the premise that JS key insertion order would carry through. It does at
> runtime, but the pipeline reads TYPES, and the type system never observes
> object key order: tsgo (like tsc) keeps `keyof` unions sorted by internal
> type id (`addTypeToUnion` inserts via a `CompareTypes` binary search), so
> the order-adversarial pins failed exactly as the spec's risk clause
> predicted — `{w: number, h: number}` projected `[h, w]`. The spec's own
> named fallback ("the sentinel could carry [label, RunType] pairs") shipped
> as the explicit per-slot carrier:
>
>     RT.tuple([RT.slot('x', RT.number()), RT.slot('y', RT.number())])   // [x: number, y: number]
>     RT.tuple([RT.slot('x', RT.number())], [RT.slot('y', RT.number())]) // [x: number, y?: number]
>     RT.tuple([RT.slot('x', RT.number())], [], RT.slot('items', RT.string())) // [x: number, ...items: string[]]
>     RT.func([RT.slot('event', RT.string())], ret)                      // (event: string) => R
>
> Slot arrays are order-native (tuples are the one order-preserving container
> in the type system), homomorphic maps derive the values + labels tuples, and
> the rest element gains what the object form could not spell: any rest label.
> Everything downstream shipped as specced — the `__rtLabels` sentinel, both
> collapse lifts, the id fold, the projection writes, the func projection
> parity fix, and the convert printer switch (slot spellings). One extra fix
> rode along: the builders' positional-arg disambiguation predated the
> entry-module-tuple migration, so a standalone `RT.tuple([...])` const
> misread its injected id as the optional-items list / rest element and
> returned the discarded carrier — the runtime now probes every trailing slot
> for the injected id first (pinned in labeledSlots.test.ts).
>
> Shipped tests: `labeled_builders_test.go` (convergence incl. BOTH
> getRunTypeId shapes, order-adversarial, same-shape/different-labels, rest
> labels, func + params-tuple carriage, projection parity),
> `labeledSlots.test.ts` (JS end-to-end twin over the real binary),
> `TestChain_LabeledTuple` / `TestChain_NamedFunctionParams` /
> `TestPortable_LabeledTupleRefused` (convert), labeled fuzz arms, and the
> `tuple_named_labels` validation case flipped from `idDivergent` to a full
> convergence pin (the plain array form keeps its pinned divergence in
> callableBuilder.test.ts by design).

## Problem

Tuple element labels and function parameter names fold into the structural id
(typeid.go — "label data lives on the node, so the label is part of
what the node IS"; tupleLabels.test.ts), but `RT.tuple` / `RT.func` could only
express unlabeled/unnamed shapes, so builder-authored types diverged from
their type-first twins (pinned: callableBuilder.test.ts, validation/
Tuple.ts `tuple_named_labels` `idDivergent: true`) and the convert CLI
refused labeled tuples on the builders and json-schema targets.

## Design (as shipped)

**API surface** (new overloads beside the plain array forms, which stay
unchanged and keep modeling unlabeled shapes):

    RT.slot(label, rt)                              // one labeled slot / named parameter
    RT.tuple([slot, …])                             // labeled fixed slots
    RT.tuple([slot, …], [slot, …])                  // + labeled optional slots
    RT.tuple([slot, …], [slot, …], slot)            // + labeled rest slot (any label)
    RT.func([slot, …], ret)                         // named all-required parameters

Slots and plain RunTypes never mix in one list (TS labels all slots or none —
enforced by overload resolution, since `SlotCarrier` is deliberately not a
`RunType`).

**Mechanism — the `__rtLabels` sentinel.** Structure reaches the Go side
ONLY through the resolved type of the `InjectRunTypeId<T>` marker parameter;
there is no call-site-AST channel for structure, and TypeScript cannot
CONSTRUCT labeled tuple types by mapped types. The carried type is the
unlabeled values tuple intersected with a sentinel that carries the labels
as a literal string tuple —

    RunType<[number, number] & {readonly [__rtLabels]?: readonly ['x', 'y']}>

— derived homomorphically from the slots array (`SlotValues` / `SlotLabels`
in builders/static.ts, so values and labels share one order by construction),
and the Go side lifts the sentinel exactly like the `__rt*` schema-check
sentinels (never surfaces as a property; folds into the id; populates
`TupleMember.Name` / `Parameter.Name`):

- typeid: `TupleLabelsFromMember` lifts the labels off the intersection and
  `tupleID(tsType, labelOverride)` folds them the way ElementInfo labels fold,
  so the slot-form id equals the type-first labeled-tuple id. Signatures
  detect the carrier on a trailing rest param (`SplitLabeledTupleIntersection`)
  and expand it into named positional params.
- serialize: `projectTuple(tsType, node, labelOverride)` writes the names onto
  the projected members — byte-identical to the type-first twin sharing the
  structural id.
- The sentinel member is stripped from every property walk
  (`IsLabelsSentinelPropName`, both memberIDs and projectMembersInto).

**The func projection parity fix.** typeid always expanded a labeled
rest-tuple parameter into named positional params but the serializer did not,
so a labeled value-first func and the written call signature shared an id yet
projected different `Parameters` (first-interned won). `expandRestTupleParam`
now mirrors the expansion in serialize for exactly the shapes whose expansion
carries names (labeled or empty tuples, declaration labels or the sentinel);
unlabeled non-empty rest tuples keep the single rest-param projection, whose
id-twins all already project that same shape.

**Convert printers** (internal/convert/print.go):

- builders target: labeled tuples print the slot form (`tupleMembers` now
  returns the label strings); functions with all-required named params print
  `RT.func([RT.slot(…)…], ret)`, optional/rest params keep the `getRunType`
  escape (their value-first spellings have no id-exact twin).
- json-schema target: labeled tuples ride the `jsLabels` dialect keyword
  (`{prefixItems: […], jsLabels: ['x', 'y']}`), which the door lowers back
  onto the `__rtLabels` sentinel — id-exact, `--portable` refuses. The
  original no-jsLabels descope was REVERSED by a follow-up decision
  (2026-08-09, "support all features in all input modes"): the keyword
  shipped right after the slot form, replacing the embed spelling.

## Out of scope

Reading labels from the call-site AST; changing
or deprecating the array/positional overloads; enum-builder nominal metadata
(separate, pre-existing divergence); an object-literal spelling (impossible —
see the shipped-note above).

## Done when (met)

`getRunTypeId(RT.tuple([RT.slot('x', TF.number()), RT.slot('y',
TF.number())])) === getRunTypeId<[x: number, y: number]>()` (and the func
twin) hold as pinned tests in both marker shapes; the convert CLI converts
labeled tuples and named functions on all three targets with unchanged ids
and C6-equal graphs; the order-adversarial pins hold; full Go + JS suites,
lint, format green.
