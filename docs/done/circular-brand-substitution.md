---
type: fix
spec: guidelines
status: done
created: 2026-08-09
completed: 2026-08-09
---

# RT.circular loses container-level sentinel payloads (id divergence)

## Problem

`RT.circular(body)` ties the recursive knot through `Recursive<Body>`
(builders/static.ts), whose `SubstituteSelf` walks the body replacing every
`Self`. Containers recurse through a homomorphic mapped type — which MERGES
an intersection into one object shape — and the Map/Set/array arms rebuild
the container from inferred pieces — which DROPS anything intersected onto
it. Both destroy container-level sentinel carriers:

    // converges (no cycle, no substitution):
    getRunTypeId(RT.object({k: RT.record(TF.number(), {minProperties: 2})}))
      === getRunTypeId<{k: TF.FormattedObject<Record<string, number>, {minProperties: 2}>}>()

    // DIVERGES (found by the FE convert roundtrip fuzz lane):
    getRunTypeId(RT.circular(RT.object({k: RT.record(RT.self(), {minProperties: 2})})))
      !== getRunTypeId<Rec>()   // type Rec = {k: TF.FormattedObject<Record<string, Rec>, {minProperties: 2}>}

Affected payloads inside a circular body: structural format brands
(FormattedArray / FormattedObject), the container-borne schema-check
sentinels (`__rtContains`, `__rtPatternProps`, `__rtPropNames`,
`__rtUnevaluated`, container-level `__rtNot`), and the labeled-tuple
`__rtLabels` carrier. Primitive brands (`string & brand`) and Date brands
pass `SubstituteSelf` untouched (the primitive/Date arms return `T`
verbatim), so ordinary format leaves inside cycles are fine.

## What shipped

**The substitution no longer rebuilds what it does not have to.**
`SubstituteSelf` gained a `ContainsSelf` pre-walk: a node that does not
reference `Self` anywhere is returned **verbatim**, so its carrier
intersection is preserved exactly (no rebuild can preserve a shape better
than not rebuilding it). That alone fixes every carrier sitting BESIDE a
cycle, and it made the no-recursion branch of the budget suite *cheaper* than
before.

For the nodes the cycle actually runs THROUGH, the rebuild became
carrier-aware:

- **objects / records** — the base is rebuilt with the sentinel keys filtered
  out (`K extends CarriedKey ? never : K`) and the slots re-attached through
  `CarrySlots`, which substitutes INSIDE each payload (a `contains` /
  `patternProperties` / `not` / `unevaluated` payload can itself hold `Self`);
- **arrays / Map / Set** — the inferred rebuild is re-intersected with
  `CarryOnto`;
- **fixed-arity tuples and function parameter lists** — rebuilt slot by slot
  from their indexes (`TupleFromIndexes`), which is exact, then re-attached.
  TypeScript cannot decompose `tuple & object` back into its tuple half:
  `[...infer B]` yields `unknown[]`, a spread widens to `(A|B)[]`, and a
  rest-parameter inference hands back the whole intersection — all three were
  measured before settling on the index rebuild.

`CarriedKey` is the closed sentinel vocabulary, and
`assertionsCarriedKeyIsExhaustive` in test/types/structural.test.ts derives
the other side from the `sentinelKeys` module, so shipping an eleventh
sentinel without wiring it here is a COMPILE error rather than a silent id
move.

**One shape remains lossy and refuses loudly** (`circularLossyPayload`,
internal/convert/print.go): an **exclusive union (`oneOf`) with a primitive /
Date / RegExp branch** reaching the cycle. The branch tuple rides EVERY arm,
and a primitive arm passes the substitution untouched, so that copy keeps an
unsubstituted `Self` — the sentinel rides a base TypeScript cannot separate
from it.

Two shapes that were lossy when this first landed were closed in a FOLLOW-UP
on the same branch:

- a **labeled tuple with an optional slot** that the cycle runs through. An
  optional slot leaves `length` a union (`1 | 2`) instead of a literal, so the
  slot-by-slot rebuild had nothing to count. It now splits: the required
  prefix is rebuilt by index, the remaining slots ride `Partial`, and the
  labels re-attach. (A REST element makes `length` plain `number`, which is
  the array arm — so optional slots were the whole case.)
- a **branded Temporal value** inside a recursive type, which had a different
  root cause entirely and is recorded in
  [docs/done/circular-temporal-brand-divergence.md](circular-temporal-brand-divergence.md).

## Cost

`substituteSelf.compile.test.ts` budgets rose on every recursive branch (the
array/tree branch most, 229→1913) and FELL on the no-recursion branch. Two
things are paid for: the `ContainsSelf` pre-walk, and a `keyof` sentinel
lookup on the nodes the cycle runs through (`keyof` an array instantiates the
whole `Array<T>` interface). Both are bounded by the containers ON the cycle,
not by the schema's size. The two cheaper probes were measured and rejected:
an assignability check against `never`-typed slots and an `infer`-based slot
read each force the deferred recursive type and trip TS2589 on every
recursive schema. Recorded as a reviewed exception in the suite header.

## Tests

- `test/features/circular.test.ts` — a convergence pin per carrier (record,
  array, contains, patternProperties, labeled tuple, labeled func params,
  nested carrier, Map/Set, all-object oneOf), each BESIDE and CARRYING the
  cycle, in both `getRunTypeId<T>()` and `getRunTypeId(value)` shapes; plus
  the top-type pin below and a "no self-reference is returned untouched" pin.
- A `Self` beside an `unknown` member used to vanish: reading a composite's
  members as ONE union (`T[number]` / `T[keyof T]`) let `unknown` absorb it,
  so the node looked non-recursive and kept its marker. Both walks now read
  members individually. Found by the FE convert fuzz lane mid-implementation.
- `test/types/structural.test.ts` — the `CarriedKey` exhaustiveness guard.
- `internal/convert/circular_test.go` — the old refusal pin became
  `TestCircular_StructuralPayloadConverts` + `TestCircular_LabeledTupleConverts`,
  and the two residuals gained their own refusal pins.
- Both sweeps carry the narrowed designed-refusal allowance with a ceiling
  (the Go sweep skips and counts such draws; the FE lane's `EXPECTED_REFUSALS`
  lists the exact messages).

## Done when — met

Value-first circular spellings with container-level sentinel payloads converge
with their type-first twins (pinned, both marker shapes); the convert builders
target prints them instead of refusing; the FE roundtrip lane passes across ten
seeds at 20 iterations and the Go sweep at 150, with the allowance narrowed to
the single documented residual (a `oneOf` with a primitive branch reaching the
cycle).
