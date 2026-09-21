---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# The recursive-schema walk gives up at its depth budget and returns the node unchanged

## Intent

`SubstituteSelf` in [packages/run-types/src/builders/static.ts](../../packages/run-types/src/builders/static.ts)
replaces the `Self` placeholder inside a recursive value-first schema. Before it rebuilds a
composite it asks `ContainsSelf<T>` whether that subtree contains a `Self` at all, so a
sentinel-free node keeps its original shape and id.

That probe walks at most 24 levels. When the budget runs out it answers `false`:

```ts
type ContainsSelfIn<T, Depth extends unknown[]> = Depth['length'] extends 24
  ? false
  : ...
```

and the caller is

```ts
ContainsSelf<T> extends false
  ? T
  : SubstituteInto<T, P>;
```

So on budget exhaustion the node is returned verbatim and the walk stops. A `Self` nested deeper
than 24 levels from that node is never substituted.

The comment that used to sit on the budget arm described the opposite behaviour. It said the arm
answers "assume it recurses", routes the node to the rebuild, and that the worst case is therefore
"the OLD behaviour for a carrier buried deeper than the budget, never a leaked `Self`". That
rationale is only sound for `true`. The comment has since been corrected to state what the code
does, which is why this spec exists: the wording was fixed, the behaviour was not settled.

## What to settle

Decide which of these is true, with evidence:

1. `false` is correct, because something else guarantees no schema ever nests a `Self` deeper than
   24 levels from a probed node. If so, say what guarantees it, and pin it with a test so the next
   reader does not ask again.
2. The arm was flipped from `true` to `false` without updating the comment, and a schema that
   nests `Self` past the budget silently keeps an un-substituted `Self` in its inferred type. That
   is a correctness bug, and the fix is to answer `true` (give up towards the rebuild, which is
   the safe direction).

Note that `SubstituteSelf` calls `ContainsSelf<T>` with the DEFAULT `Depth`, so the budget restarts
at every composite it descends through. Work out whether that restart already bounds the damage
before concluding either way.

## Evidence to produce

- A type-level test that nests `Self` deeper than the budget and asserts what the inferred type is
  today. That test is the repro, whichever way the answer goes.
- If the answer is to flip the arm: the `packages/type-budget` suite before and after, because this
  probe runs on every keystroke in a consumer's editor and the cheap-probe alternatives are
  documented as known losses in `packages/run-types/src/builders/TYPE-COST.md`.
- The id-integrity suite (`packages/run-types/test/suites/id-integrity/`) must still pass: a builder
  and its type-first equivalent have to converge on one structural id.

## Watch out

- Flipping to `true` means more nodes reach `SubstituteInto`. The risk is TS2589
  (instantiation-depth) on recursive schemas, which is exactly what the surrounding comments say
  the cheaper probes tripped. Measure, do not assume.
- Do not "fix" this by raising 24 to a larger number without answering the question. A bigger
  budget moves the cliff, it does not remove it.

## Origin

Found during a repo-wide comment simplification pass, by reading the budget arm's comment against
the code it sits on. Not introduced by that pass; the pass only corrected the wording.
