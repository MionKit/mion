---
type: fix
spec: guidelines
status: ready
created: 2026-08-09
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

## Current mitigation (shipped)

The convert CLI's builders target REFUSES a branded non-Date class leaf inside
a recursive declaration (CNV001, "a branded Temporal value inside a recursive
type…", `circularLossyPayload` in internal/convert/print.go), and both fuzz
sweeps count that refusal as a designed lane rather than a failure. The type
and json-schema forms carry the declaration exactly, so only the value-first
authoring is affected.

## Done when

The value-first spelling above converges with its type-first twin (pinned in
both marker call shapes, beside AND carrying the cycle), the convert refusal
for branded class leaves is removed, and both sweeps run with that entry gone
from their designed-refusal allowance.
