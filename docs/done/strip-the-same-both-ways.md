---
type: fix
spec: full-plan
status: done
created: 2026-09-13
---

# Clone strips undeclared keys inside a union, on both ends

`clone` promises that only what the type declares crosses the wire. A union whose members are all
JSON-compatible broke that promise in both directions:

```ts
type Params = {a: string}[] | number;
// a caller posted [{a: 'x', evil: 1}] and the handler saw evil
```

An ARRAY counts as an atomic member in the flat union layout, so this union has no object members at
all. Every arm gated on that returned identity before it ever compiled the array, and the array's
own arm (which would have cloned and stripped) never ran.

## What shipped

One conjunct on the shared gate, in `ts-go-runtypes/internal/cachegen/typefunctions/`:

```go
// union_flat_layout.go
func (layout FlatLayout) atomicOnlyJsonIdentity() bool {
    return len(layout.ObjectMembers) == 0 && !layout.AtomicNeedsTuple && layout.AtomicsExtraProof
}
```

`AtomicsExtraProof` is a FIELD on `FlatLayout`, computed once in `buildFlatLayout`, not a finished
verdict: `buildCompactFlatLayout` mutates `AtomicNeedsTuple` after `buildFlatLayout` returns, so a
stored verdict would go stale while a stored conjunct stays correct.

It reads `isExtraProof` ("no undeclared key can hide in this subtree") through a small local wrapper
that also passes `any`, `unknown` and bare `object`. Those declare nothing, so a strip walk has
nothing to remove; `isExtraProof` itself was left alone, because it also decides whether a value may
be SHARED by reference and widening it would start aliasing `any[]` somewhere unrelated.

Three families read that gate, so one edit fixed all three:

| family | strategy | before | after |
| --- | --- | --- | --- |
| `pjs` | clone encode | leaked | strips |
| `rjs` | clone decode | leaked | strips |
| `sj` | direct encode | leaked | strips |
| `pj` / `rj` | mutate | keeps extras | unchanged, by design |
| `cj` / `cjr` | compact | already strips (it forces an envelope) | unchanged |

No new emitter code on either side. Both member walks already existed and were simply skipped.

The noop predicate had to move with the emit. `isNoopForRestoreJsonSafe` answered `true` for this
shape, and `RestoreFromJsonSafeEmitter` sits on the walker's dispatch gate, so a predicate claiming
noop while the emit walks replaces the child call with empty code and the rebuild never runs. Its
union arm gained the matching conjunct, hand-rolled over `SafeUnionChildren` so it never calls
`buildFlatLayout` (which emits drop diagnostics a predicate must not duplicate). `unionJsonNoop`
was left alone: it is shared with the mutate engine.

## What changed observably

- **Key order** inside a nested object in a union member is now DECLARED order rather than runtime
  insertion order. Same JSON, different bytes. Every non-union position already behaved this way.
- `pjs` no longer returns the caller's array by reference; it allocates through `v.map`. Invisible
  through the composite encoder, visible to a direct `getRTFunction<'pjs'>` consumer.
- A value matching no member now hits the encode chain's `throw new Error(fuEncErr)` where it used
  to pass through. Encode only; the decode side deliberately does not throw.

## Not a gap, recorded so nobody reopens it

**Index signatures do not strip, and should not.** A plain `[k: string]` declares every key. For a
pattern-keyed signature a non-matching key is not stripped either, it is REFUSED by validation
(`validate.go:1699`, inside `emitIndexSignatureValidate`):

```js
if (!reIdx.test(k)) return false;
```

So a stray key never reaches the handler whatever the decoder does, and the compact decoder walking
an index-signature object in place is correct rather than a bug.

## Tests

- `union_flat_compact_test.go`: `TestAtomicOnlyUnion_StripsInsideItsMembers` asserts `pjs`, `rjs`
  and `sj` each walk the array member on the `'union'` entry line, and that the mutate pair stays
  the noop short form. `TestPureAtomicUnion_StaysCompiledAway` pins that `string | number` still
  emits nothing. Both were A/B checked against a reverted fix before being accepted, after a first
  version passed WITHOUT the fix by matching code the per-entry array factory always carries.
- `noop_types_test.go`: `TestNoopType_RestoreFromJsonSafe`, the first table test this predicate has
  ever had, plus a pin that `isNoopForRestoreJson` (mutate) still answers `true` for the same
  unions.
- `packages/router/src/encoder.spec.ts`: a union-typed param on a clone route drops an undeclared
  key on arrival, and the clone return drops one too.
- A new fuzz oracle, O26, asserts the planted wire key is ABSENT after the stripping decoder, rather
  than blanked. It reuses `plantWireKeys` (type-blind, so it reaches inside union arms with no
  walker change) and gives every call its own copy, since `rjs` rewrites in place. It runs under the
  same carve-out gate as O25: a key planted into an index-signature object IS declared, so a correct
  decoder keeps it.

## Split off

Two items of the original plan did not ship, because both need a fix in a DIFFERENT family first:
`hasUnknownKeys`, `unknownKeyErrors` and the `strategy: 'strip'` decoder never look inside an atomic
union member either, so they report clean for a key `cloneExactShape` drops. A serialization-suite
union case and a fuzz target of this shape both fail on that, not on anything here. The reporter
gap, the suite case and the fuzz walker descent are one follow-up spec of their own.
