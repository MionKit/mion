---
type: fix
spec: guidelines
status: done
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

## The answer: `false` is correct, and it is an answer rather than a guess

Neither of the two options in the original spec was quite right. `false` is correct, but not
because nothing ever nests a `Self` deeper than 24 levels. It is correct because of what a node
that fails to bottom out in 24 levels actually is.

A schema body is a finite tree. A class, a builtin and an already-resolved `Recursive<…>` all
loop, so they never bottom out. The cap is what separates the two, and every node it catches
holds no `Self` at all: a class has none, and an already-resolved recursive type had its `Self`
substituted when it was built. So `false` is the true answer for the nodes the cap is aimed at.

The restart does not bound the damage. `SubstituteSelf` re-probes with the default `Depth` at
every composite it descends through, but it only descends when the probe says `true`, so a node
whose nearest `Self` sits more than 24 levels below it is returned verbatim and never descended.

### `true` was measured and is not an option

Flipping the arm to `true` and running `pnpm exec vitest run substituteSelf`:

| | `false` (today) | `true` |
| --- | --- | --- |
| suite | 13 passed, 2.8 s | never starts |
| resolver process | roughly 200 MB | grows past 10 GB, killed |

```
[@mionjs/devtools] resolver process died unexpectedly — respawned it and retrying the interrupted request.
Error: generate: resolver exited
```

Reproduced twice on an otherwise idle host. Every class-carrying node reaches `SubstituteInto`
once the cap says `true`, and the rebuild of those nodes is what exhausts the checker.

Measured on the sliced region, the same flip also makes `ContainsSelf` answer `true` for
`Fluent`, `Uint8Array`, `Generator` and `WeakMap`, none of which hold a `Self`, and costs +13% on
a `Uint8Array` member (104176 to 117817 net) and +25% on a `DataView` one (8162 to 10242).

### The price, and why it stays

A `Self` nested 24 or more levels under a probed node stays un-substituted. The cap falls at
exactly 24 plain object levels: `ContainsSelf` finds a `Self` at 23 and not at 24, and
`Recursive<Body>` over a 24-level nest returns `Body` verbatim with the placeholder still in it.

That is a real limit and it is now pinned rather than left to be rediscovered. It is not fixed,
because both directions have a cliff and this one is the cheaper of the two: a class in a schema
body is ordinary, 24 levels of nesting inside one recursive body is not, and a leaked `Self` is an
opaque brand that fails at the use site rather than silently mis-typing a value. Raising 24 moves
both cases together and removes neither.

## What shipped

- [packages/run-types/src/builders/static.ts](../../packages/run-types/src/builders/static.ts) —
  the budget arm's comment now states the rule the code implements, the measured result for
  `true`, and the price. No behaviour change.
- [packages/run-types/test/types/substituteSelf.compile.test.ts](../../packages/run-types/test/types/substituteSelf.compile.test.ts) —
  a depth-cap battery of four cases: the cap falls at exactly 24, a `Self` past it is left
  un-substituted, one level shallower still ties the knot, and a `circular` schema nested inside
  another one is left intact. Budgets 1933 / 14441 / 2969; the 1933 against 14441 is the same nest
  costing 7x once the walk finds the `Self` and rebuilds all 23 levels instead of giving up.
- [packages/run-types/src/builders/TYPE-COST.md](../../packages/run-types/src/builders/TYPE-COST.md) —
  the `true` measurement under *What was measured and REJECTED*.

`packages/run-types/test/suites/id-integrity/` and `packages/type-budget` both still pass, which
is expected: no type changed.

## Origin

Found during a repo-wide comment simplification pass, by reading the budget arm's comment against
the code it sits on. Not introduced by that pass; the pass only corrected the wording.
