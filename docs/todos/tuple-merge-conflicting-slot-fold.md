---
type: fix
spec: guidelines
status: ready
created: 2026-08-06
---

# Fold a tuple slot two applicators constrain differently

## Intent

One JSON-Schema-Test-Suite case still diverges, and it is the last one:

```
items.json :: items does not look in applicators, valid case
              :: prefixItems in allOf does not constrain items, valid case
```

```json
{"allOf": [{"prefixItems": [{"minimum": 3}]}], "items": {"minimum": 5}}
```

Index 0 is constrained twice, with different bounds: `minimum: 3` from the
`allOf` member's `prefixItems`, `minimum: 5` from the sibling `items`. The
correct reading is the conjunction, `minimum: 5`. We reject `[5, 5]` instead.

Nothing is silently accepted: the array projects `never`, so the failure is an
OVER-rejection. That is the safe direction the merge was designed around, which
is why this shipped rather than blocking the feature.

## Where it comes from

The door lowers the two halves independently and hands the collapse a real TS
intersection:

```ts
readonly [number & Min3?, ...unknown[]] & readonly (number & Min5)[]
```

`MergeTupleIntersection`
([ts-go-runtypes/internal/cachegen/runtype/typeid/tuplemerge.go](../../ts-go-runtypes/internal/cachegen/runtype/typeid/tuplemerge.go))
resolves that slot-wise, and it is deliberately BOUNDED: a slot resolves when
one side is `unknown` / `any`, or when both sides carry the same structural id.
`Min3` and `Min5` are neither, so the merge reports a conflict and both collapse
halves project `never`.

The bound exists because the merge has no way to SAY "both". It picks one
contributing `*checker.Type` per slot and hands it to `Serialize` (or
`Compute`), and the tsgolint shim
([third_party, off-limits](../../ts-go-runtypes/third_party/)) exposes no
intersection-type constructor, so there is no `Min3 & Min5` checker type to hand
over. Reading the intersection's property `"0"` does not help either: a plain
array has no property `"0"` (it indexes through a number index signature), so
the synthesized intersection property would be `Min3 | undefined` alone, which
would silently DROP the `minimum: 5` bound. That is the one outcome the merge
must never produce.

## Direction

Investigate and plan; the shape below is a starting point, not a mandate.

Carry the conflict forward instead of failing on it. `TupleMergePick` grows a
folded form, and the fold decision is made ONCE, in the shared `typeid` package,
so both collapse halves reach the same verdict by construction:

- decompose each contributing slot type into (primitive base, format
  annotations) using the existing `FormatAnnotationFromType`;
- the bases must agree, and the annotations must merge through
  `MergeFormatAnnotations`, which already tightens bounds by max/min and folds
  `multipleOf` by least common multiple;
- anything outside that stays a conflict and still projects `never`.

Then the two callers materialize the fold:

- serialize (`projectMergedTuple`): the base node with the merged annotation
  attached. **Do not mutate a node `Serialize` returned** — nodes are interned
  by id and a mutation would corrupt every other holder of that id.
- typeid: `Compute(base) + FormatAnnotationStructuralKey(merged)` — the same
  formula the single-base-plus-sentinel branch already uses, so the merged id
  stays byte-equal to the hand-written equivalent.

## Why this is filed rather than fixed

It touches the two-halves-stay-twins invariant: `runtype/intersection_collapse.go`
and `typeid/intersection_collapse.go` must fold identically or a cache entry and
its id part company. That is a load-bearing invariant, the change needs its own
id-convergence coverage, and the divergence it fixes is one over-rejecting case.

## Done when

`[5, 5]` validates for the schema above, `[3, 5]` still does not; the
`items.json` ledger entry is gone and `CONFORMANCE.md` reports zero open
divergences; an id-integrity test pins that the merged slot converges with the
hand-written `readonly [number & Min5, ...(number & Min5)[]]` spelling; and Go
unit tests cover both the folding and the still-conflicting paths.
