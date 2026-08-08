---
type: feature
spec: guidelines
status: ready
created: 2026-08-08
---

# Runtime-aware key scanning in the `hasUnknownKeysFromArray` / `getUnknownKeysFromArray` factories

Follow-up to [runtime-aware-key-counting](../done/runtime-aware-key-counting.md), which
was deliberately scoped to `rt::countEnumKeys` alone and listed this as out of scope
"worth its own todo once this pattern is proven". It is now proven: that change shipped,
and on the strict fast path it measured **~1.58x on Bun with no V8 regression**.

## The claim to test

Two sibling pure fns in
[packages/ts-runtypes/src/runtypes/pure-fns-utils.ts](../../packages/ts-runtypes/src/runtypes/pure-fns-utils.ts)
still enumerate with a bare `for-in`:

- `pf_hasUnknownKeysFromArray` (`:59` before this change; the boolean predicate)
- `pf_getUnknownKeysFromArray` (`:24`; the same scan, collecting up to
  `MAX_UNKNOWN_KEYS` names)

These are the **slow-path** counterparts to the count check — the ones that run whenever
the object is not all-required, has an index signature, or has non-RT children, and the
ones that run for the plain (non-`runsAfterValidation`) variant. So they cover strictly
more call sites than the fast path that was just optimised, even though each call is
individually more expensive.

If JavaScriptCore's structure-table advantage carries over, `Object.keys(obj)` followed
by an indexed loop should beat `for-in` on Bun here too, and lose to it on V8 — the same
inversion, same one-time factory branch, same `typeof Bun !== 'undefined'` probe (the only
engine probe the purity checker allows; see `TestPurity_BunEngineProbe_Allowed`).

It is a *hypothesis*, not a measurement. These loops do real per-key work (an inner linear
scan against the known-keys array), so the enumeration cost is a smaller share of the
total than it is in the pure counter, and the win may not survive. **Measure before
building anything.**

## What is different here, and why it needs care

The count fast path had one semantic axis to worry about (for-in counts inherited
enumerable properties, `Object.keys` does not) and it was closed with a per-call
prototype guard that measured free. Reuse that guard — it is the proven shape:

```ts
const proto = Object.getPrototypeOf(obj);
if (proto === objectProto || proto === null) { /* Object.keys path */ }
/* else fall back to for-in */
```

But these two functions are harder than the counter in one way that the counter was not:
they do not return a NUMBER, they return / act on the key names themselves. So
equivalence is not just "same count" but **same set, and for `getUnknownKeysFromArray`,
same order and same truncation point** — it throws once it hits `MAX_UNKNOWN_KEYS`, so a
different enumeration order changes which keys are reported and when the throw fires.
`Object.keys` and `for-in` agree on order for own enumerable string keys (integer-like
keys ascending, then insertion order), but that equivalence needs pinning by test, not
assuming.

## Suggested shape of the work

1. **Measure first**, with the methodology the parent spec insists on: one variant per
   process, non-constant inputs (rotating pool), median of 7, order reversed across
   passes, ns/op sanity-checked. Benchmark both functions, at a few key counts (the inner
   scan is O(props x keys), so the shape matters), on Node and Bun. If there is no
   material win, **close this todo as "measured, not worth it"** and record the numbers —
   that is a perfectly good outcome and stops the question being reopened.
2. If the win is real, branch each factory the same way `pf_countEnumKeys` does, keeping
   the prototype guard.
3. Regenerate the built-in table (`pnpm rtx core codegen builtinpurefns`) — both bodyHashes
   change, and `pnpm rtx core codegen all --check` must be green.
4. Tests, modelled on
   [packages/ts-runtypes/test/features/countEnumKeys.test.ts](../../packages/ts-runtypes/test/features/countEnumKeys.test.ts):
   force each branch under Node by defining a `Bun` global while the factory runs, then
   assert the two implementations agree on **result and order** across plain literals,
   null-prototype objects, inherited-enumerable shapes, integer-like keys, and the
   `MAX_UNKNOWN_KEYS` truncation boundary. Include a seeded sweep.

## Out of scope

- Any change to when the emitter chooses the scan over the count check
  (`countFastPathN` in
  [ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_shared.go](../../ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_shared.go)).
- Engines beyond Bun. Deno is V8 and takes the default branch; nothing else is detectable
  under the purity rules.
- A general engine-adaptive codegen framework. This stays a per-primitive decision.

## Done when

- Both functions are measured on Node and Bun with the methodology above, and the numbers
  are recorded in this doc.
- Either the branch ships with equivalence (result AND order) pinned by tests and the
  table regenerated, or the doc records that the win did not materialise and the code is
  left alone.
