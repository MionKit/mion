---
type: fix
spec: guidelines
status: done
created: 2026-08-30
completed: 2026-08-31
---

# runsAfterValidation fast path is lost at named nested object types

## What was wrong

`createHasUnknownKeysFn<T>(undefined, {runsAfterValidation: true})` promised, in its own doc
comment, that all-required object nodes replace the O(props x keys) key-array scan with a key-count
compare (`countEnumKeys(v) !== N`).

It only delivered that at nodes that ended up INSIDE the root body. A NAMED nested type (a type alias
or an interface used as a property) is emitted as a separate entry and dep-called, and that call
resolved to the PLAIN `huk` entry, which has no fast path. So the common real-world shape, where
people name their nested types, silently kept the slow scan.

Results were always correct. It was the documented contract and the advertised speedup that were
wrong, which is why this was a `fix`.

The emitted bodies for the two shapes, before:

```js
// type Inline = {inner: {a: string; b: string}}   ← anonymous nested type, inlined
Omg_inline(v, opts = {}) { return (cntEK(v) !== 1 || cntEK(v.inner) !== 2) }

// type Named = {inner: Inner}                     ← named nested type, external entry
Omg_named(v, opts = {}) { return (cntEK(v) !== 1 || lRN_inner.fn(v.inner, opts)) }
lRN_inner(v, opts = {}) { return (typeof v === 'object' && v !== null && hUKFA(v, k_inner)) }
```

`lRN_` is the PLAIN `huk` hash: the named child ran the scan, and kept the typeof guard the option
is supposed to drop.

## What shipped

`runsAfterValidation` became a PROPAGATING variant: an option whose claim is about the VALUE (if `v`
passed validate then so did `v.inner`, at every depth) rather than about the root call, so the whole
subtree renders under it.

Three pieces, all in `ts-go-runtypes/internal/cachegen/typefunctions/`:

- **`VariantPropagator`** (`emitter.go`) — a new optional emitter capability, `PropagatesVariant(options
  []string) bool`. `HasUnknownKeysEmitter` returns true for `runsAfterValidation`; every other family
  is untouched and its variants stay root-scoped, which is right for them (validate's
  `noIsArrayCheck` describes the root call, not the value).
- **The collector** (`module.go`) — the child worklist now carries a `childDemand{hash, suffix,
  options}` instead of a bare hash, and `entryInnerPrefix` gives a propagating entry the variant's
  own `<variantFnHash>_` namespace. Children of a propagating variant therefore render as variant
  entries and the parent's dep call names them.
- **Disk cache and overrides** — both limits that made this route look expensive are gone. Entries
  are now keyed `<typeID>/<tag><variantSuffix>.json` (`entryCacheTag`), so a propagating variant is
  cached like the plain family instead of re-walking its whole subtree every build, with no collision
  against the plain body for the same type. And a user override on a type still redirects for a
  propagating variant: the option refines HOW the same answer is computed, so skipping the redirect
  would have silently dropped the user's function at every named nested type the variant now reaches.
  Root-scoped variants and the armed circular-guard variant keep their existing behaviour on both
  points.

After:

```js
Omg_named(v, opts = {}) { return (cntEK(v) !== 1 || Omg_inner.fn(v.inner, opts)) }
Omg_inner(v, opts = {}) { return cntEK(v) !== 2 }
```

### Agreement with the fused-traverser work

The in-flight fused multi-family traverser spec (a separate branch, not in this PR) answers the same
variant-vs-family question and concludes fused output should be families, because a variant is
root-scoped, is never disk-cached, and skips overrides. This change removes all three limits for a propagating variant rather than
inventing a second answer: a propagating variant now behaves exactly like the family that doc asks
for (own namespace, own disk cache, overrides honoured) while staying one operation with one fnHash
axis, which is what it is. A new operation (validate fused with huk) is still a new family.

## Measurements

Re-measured on Node 26, 2M iterations after a 200k warmup, object-literal shapes (not
dictionary-mode objects, which distort both sides badly).

| Shape | Before | After | Speedup |
| --- | --- | --- | --- |
| flat, 7 props, plain vs fast | 38.8 ns | 14.3 ns | 2.7x |
| flat, 30 props, plain vs fast | 369.9 ns | 27.3 ns | 13.2x |
| named nested, 7 props, before vs after this fix | 89.7 ns | 25.1 ns | 3.6x |
| named nested, 30 props, before vs after this fix | 362.7 ns | 38.0 ns | 9.7x |

The doc comment's ~3x at 7 props is confirmed. Its **~44x at 30 props is not**: the same shape
measures ~13x here. The claim was corrected to ~13x in
`packages/ts-runtypes/src/createRTFunctions.ts`, in the emitter comment, and in the guide example.
(`CHANGELOG.md` keeps its original wording: it records what was claimed at that release.)

## Tests

- `ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_has_variant_test.go` — four emit tests
  over the named-vs-inline pair: the named child gets the count compare and is dep-called at the
  variant key; the plain family still scans; both variants of one type coexist as independent
  subtrees; an override on the nested type still redirects. Plus a disk-cache test proving the
  variant subtree is written under its own basename and replays byte-identically.
- `packages/ts-runtypes/test/features/unknownKeys.test.ts` — the runtime half: a named nested type
  answers exactly like the plain predicate on clean, nested-dirty and root-dirty inputs, the compiled
  child body carries `cntEK` and neither `hUKFA` nor a typeof guard, and the parent body references
  the variant fnHash and not the plain one.

## Docs

- `packages/ts-runtypes/src/createRTFunctions.ts` — the `HasUnknownKeysCompileOptions` comment now
  states the depth behaviour and carries the corrected number.
- `packages/examples/src/guide/unknown-keys-after-validation.ts` — the example gained a named nested
  type and a nested extra key.
- `container/website/sites/runtypes/content/02.guide/03.validation.md` — says the fast path applies at
  every depth, inline or named.

## Out of scope, deliberately

Making the ROOT-scoped variants (validate's `noLiterals` / `noIsArrayCheck` / number modes) disk-cached
too. They are a single extra entry each, cheap to re-render, and nothing in this fix needs it.
