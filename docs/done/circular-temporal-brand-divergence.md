---
type: fix
spec: guidelines
status: done
created: 2026-08-09
completed: 2026-08-09
---

# A branded Temporal value inside a recursive type diverges (id moves)

## Problem

A Temporal format brand (`TFT.PlainDateTime<{max: …}>` and friends) sitting
inside a `circular(…)` body resolves a DIFFERENT structural id value-first
than its type-first twin. The same brand OUTSIDE a cycle converges, and a
primitive-based brand (`TF.Email`) inside a cycle converges — only the
class-based brand inside a recursive declaration moves.

Measured with the marker directly (probe run against the shipped dist):

    OK    bare Temporal.Instant in cycle          znP3XDF == znP3XDF
    FAIL  branded PlainDateTime in cycle          O6AqEqS != Q8Oqw2E
    OK    branded PlainDateTime acyclic (control) rrZTF37 == rrZTF37
    OK    branded string (TF.Email) in cycle      NZjBHTN == NZjBHTN

The failing value-first spelling:

    circular(object({
      value: TFT.plainDateTime({max: 'now+P1DT2H'}),
      next: optional(self()),
      kids: array(self()),
    }))

against the type-first twin:

    interface BrandedT {
      value: TFT.PlainDateTime<{max: 'now+P1DT2H'}>;
      next?: BrandedT;
      kids: BrandedT[];
    }

## Not the sentinel-carry bug

This is NOT the carrier-intersection loss fixed in
[docs/done/circular-brand-substitution.md](../done/circular-brand-substitution.md).
It was verified to reproduce IDENTICALLY (same two ids, `O6AqEqS` vs
`Q8Oqw2E`) with that fix reverted, so its root cause is separate and still
unknown. Suspicion worth checking first: `SubstituteSelf`'s object arm treats
a class instance type as an ordinary object and maps it, while `Date` and
`RegExp` are explicitly passed through — a Temporal instance type has
self-returning methods (`with(...): Temporal.PlainDateTime`), so the walk may
be reshaping the class rather than leaving it alone. If so, the fix is to
treat builtin class instance types as leaves in the substitution (they can
never contain `Self`), the way `Date`/`RegExp` already are.

## What shipped

The suspicion above was right. `SubstituteSelf` passed `Date` and `RegExp`
through as leaves but treated a Temporal value as an ordinary object, and
walking one is not merely wasteful — `PlainDateTime.with(…)` returns a
`PlainDateTime`, so the member walk circularly references itself, TypeScript
resolves the member to `any`, and `ContainsSelf` answered `true` for a BRANDED
value (`false` for a bare one, which is why only the branded case diverged).
The node was then rebuilt, flattening the class into a plain object literal.

Temporal joined the leaf list. `BuiltinClassLeaf` (builders/static.ts) is the
union of the eight Temporal instance types, each behind the same
`typeof globalThis extends {Temporal: …}` guard the format brands already use,
so it degrades to `never` — and the list back to exactly `Date | RegExp` — for
a consumer without the Temporal lib. Both the substitution and the
`ContainsSelf` walk stop there. `assertionsBuiltinClassLeavesAreExhaustive`
(test/types/structural.test.ts) derives the other side from
`TemporalBaseByFormatName`, so a new Temporal type is a compile error here
rather than a silent id move.

Two things came out of the same work:

- The walk needed a DEPTH BOUND regardless. A `circular(…)` schema nested
  inside another one resolves to a genuinely self-referential type, and
  walking one never terminates: reading members per-key (needed so an
  `unknown` sibling cannot absorb a `Self`) made TypeScript report TS2615,
  and boxing the members turned that into TS2589. The walk now gives up after
  12 levels and answers "assume it recurses", which routes the node to the
  rebuild — the behaviour every node had before the walk existed, so the worst
  case is a carrier buried deeper than the budget, never a leaked `Self`.
- The convert refusal for branded class leaves is gone, and both sweeps run
  without that entry.

## Done when — met

The value-first spelling converges with its type-first twin (pinned in both
marker call shapes in test/features/circular.test.ts, beside AND carrying the
cycle, with bare Temporal, `Duration` and `Date` as regression pins), the
convert refusal is removed, and both sweeps pass with it gone from their
designed-refusal allowance.
