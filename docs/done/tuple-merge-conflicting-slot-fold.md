---
type: fix
spec: guidelines
status: done
created: 2026-08-06
---

# Fold a tuple slot two applicators constrain differently

**Status:** done, the same day it was filed. The suite now reports **zero** open
divergences. See "Shipped" at the bottom, including the one thing this spec did
not anticipate.

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

## Why this was filed rather than fixed on the spot

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

## Shipped

The design above held. `TupleMergePick` gained a `Fold` field, `SlotFold` carries
the resolution, and `SlotFold.Structural` is the single formula both halves
call, so the fold verdict is reached in ONE place and the twins cannot drift.
The serialize half builds a FRESH node keyed by that structural (never mutating
an interned one) and the id half reuses the same string.

One safety property made the whole change cheap to reason about: **every slot
that reaches the fold previously projected `never`.** The path is new ground, so
no id that resolves today can move. The full suite confirms it.

### What the spec missed: the slots are UNIONS, not primitives

The plan assumed a contended slot is a branded primitive. It is not, for the
very case being fixed. A type-LESS JSON Schema keyword denotes the six-kind
union, so the two sides are `string | Min3 | boolean | null | unknown[] |
Record<…>` and the same with `Min5` — identical but for the number arm. So the
fold conjoins ARM BY ARM: identical arms pass through, same-base arms merge
their annotations, and a pair nothing here can express is DROPPED. Dropping a
union arm narrows the slot, so the failure direction is still over-rejection.

Two shapes had to be squared up before any pairing could happen, and both were
found by reading the actual node dumps rather than reasoning about them:

- **Opaque optionals.** The tuple slot is `U3 | undefined` whose strip keeps
  `null`, so `ResolveOptionalChild` returns a member LIST and no single type.
  The merge used to give up on that outright. `tupleSlot` now carries the member
  list, and an opaque side counts as a disagreement whose arms fold like any
  union's.
- **`boolean` has two spellings.** A raw union reports it as `true | false`; the
  optional-child resolution reports it whole. Pairing them at different
  granularity pruned the boolean arm out of the result entirely, which is how
  the first working version quietly rejected `[true]`. `normalizeBooleanArms`
  rewrites the literal pair into whichever whole `boolean` another contender
  already spelled, before anything pairs.

With those two in place the folded node is byte-identical to the hand-written
twin, arm for arm.
