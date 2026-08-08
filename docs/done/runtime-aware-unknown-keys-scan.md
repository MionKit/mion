---
type: feature
spec: guidelines
status: done
created: 2026-08-08
completed: 2026-08-08
resolution: measured-not-worth-it
---

# Runtime-aware key scanning in the `hasUnknownKeysFromArray` / `getUnknownKeysFromArray` factories

**Resolved: measured, not worth implementing. No code changed.** The hypothesis below was
tested and falsified — see [Measurements](#measurements). This doc is kept so the question
does not get reopened from first principles.

Follow-up to [runtime-aware-key-counting](runtime-aware-key-counting.md), which was
deliberately scoped to `rt::countEnumKeys` alone and listed this as out of scope "worth
its own todo once this pattern is proven". That change shipped and won ~1.43x on Bun with
no V8 regression, which is what prompted asking the same question here.

## The claim that was tested

Two sibling pure fns in
[packages/ts-runtypes/src/runtypes/pure-fns-utils.ts](../../packages/ts-runtypes/src/runtypes/pure-fns-utils.ts)
enumerate with a bare `for-in`:

- `pf_hasUnknownKeysFromArray` — the boolean predicate
- `pf_getUnknownKeysFromArray` — the same scan, collecting up to `MAX_UNKNOWN_KEYS` names

These are the **slow-path** counterparts to the count check: they run whenever the object
is not all-required, has an index signature, or has non-RT children, and for the plain
(non-`runsAfterValidation`) variant. So they cover more call sites than the fast path that
was just optimised.

The hypothesis: if JavaScriptCore's structure-table advantage carries over, swapping
`for-in` for `Object.keys` plus an indexed loop should beat the incumbent on Bun and lose
on V8 — the same inversion, same one-time factory branch.

The doubt, stated when this was filed: these loops do real per-key work (an inner linear
scan against the known-keys array), so enumeration is a smaller share of the total than it
is in the pure counter, and the win might not survive.

**It did not survive.**

## Measurements

Methodology as required: one variant per process, rotating pool of 64 distinct objects,
median of 7 samples, order reversed across passes, ns/op sanity-checked. Three object
sizes (3 / 10 / 30 properties), clean objects (the worst case — every property runs the
inner loop to completion) and dirty objects with the unknown key placed LAST.

ns/op, clean case, reversed-order pass (the forward pass agreed):

| engine | fn | props | `for-in` (today) | `Object.keys` | guarded `Object.keys` |
|---|---|---|---|---|---|
| node 26.7.0 | has | 3 | **21.9** | 29.1 | 46.7 |
| node 26.7.0 | has | 10 | **69.3** | 95.0 | 94.6 |
| node 26.7.0 | has | 30 | 1098 | **937** | 994 |
| node 26.7.0 | get | 3 | **21.9** | 29.0 | 39.5 |
| node 26.7.0 | get | 10 | **66.5** | 86.8 | 97.7 |
| node 26.7.0 | get | 30 | 1134 | **908** | 876 |
| bun 1.3.11 | has | 3 | **14.6** | 21.9 | 22.5 |
| bun 1.3.11 | has | 10 | **88.8** | 105.9 | 98.5 |
| bun 1.3.11 | has | 30 | **713** | 809 | 762 |
| bun 1.3.11 | get | 3 | **39.4** | 40.3 | 43.9 |
| bun 1.3.11 | get | 10 | **114.0** | 123.0 | 124.5 |
| bun 1.3.11 | get | 30 | 958 | **818** | 1076 |

**On Bun, `for-in` wins or ties in every configuration except one**, and that one
(`get` at 30 props) is contradicted by its own `has` counterpart at the same size, so it
is noise rather than signal. There is no inversion to exploit here. Implementing the
branch would add a second code path, a second body to keep equivalent, and a bodyHash
churn, in exchange for nothing.

### Why the counter inverted and the scan does not

The counter does nothing but enumerate, so the enumeration strategy IS the whole cost, and
a 1.4x difference in enumeration shows up as a 1.4x difference in the function. In the
scan, enumeration is a small share of a much larger per-key cost: at 10 properties the
scan runs 100 string comparisons and costs ~90-115 ns/op, against ~15-25 ns/op for the
counter over the same object. Any enumeration advantage is diluted below the noise floor,
and `Object.keys`'s array allocation is a real cost that the extra indexed loop does not
recover.

### A harness error worth recording

The first pass produced much larger numbers (e.g. 382 ns/op for `has` at 10 props on Node,
versus 68 once fixed) and appeared to show a large win for a `Set`-based rewrite. The
cause: the benchmark built its known-keys array with `'f' + i`, producing strings that are
**not interned**, so every `keys[j] === prop` was a full character-by-character compare
instead of a pointer compare. Production is the opposite — the emitted cache module
declares the known keys as string literals, which the engine interns, so the comparison is
a pointer check.

Anyone re-measuring this must build the known-keys array from interned strings (e.g.
`Object.keys(template)`), or the linear scan will look several times worse than it is.
This sits alongside the parent spec's methodology warnings.

### The `Set` idea was also measured, and is also not worth it

Since the inner linear scan dominates, the obvious alternative is a `Set` membership test,
with the `Set` cached in a `WeakMap` keyed by the known-keys array identity (call sites
reuse the same array, so it would be built once). Measured, clean case, `has`:

| engine | props | `for-in` + linear scan | cached `Set` |
|---|---|---|---|
| node 26.7.0 | 3 | **21.6** | 28.7 |
| node 26.7.0 | 10 | 67.7 | **51.6** |
| node 26.7.0 | 30 | 1125 | **838** |
| bun 1.3.11 | 3 | **17.5** | 47.4 |
| bun 1.3.11 | 10 | **97.0** | 143.9 |
| bun 1.3.11 | 30 | 1387 | **473** |

It loses at 3 properties on both engines (the common shape, where the `WeakMap` lookup
costs more than a three-element scan), loses at 10 on Bun, and only pays clearly at 30.
That is another engine-dependent wash, not a win, and it would add a per-call-site cache
with lifetime questions. Building the `Set` per call instead of caching it is far worse
everywhere (up to 5x slower on Bun) and is not a candidate at all.

If this is ever revisited, the promising direction is **not** a different runtime data
structure — it is emitting a specialised body per call site (the key list is known at
build time, so the scan could be unrolled or compiled into a switch) which removes the
inner loop entirely rather than making it faster. That is a different change with a
different risk profile, and would need its own spec.

## Outcome

- No source change. `pf_hasUnknownKeysFromArray` and `pf_getUnknownKeysFromArray` keep
  their `for-in` loops.
- No table regeneration, no new tests: nothing shipped.
- The parent spec's engine-branch pattern stays a **per-primitive** decision, confirmed
  rather than assumed. `rt::countEnumKeys` remains the only place it pays.
