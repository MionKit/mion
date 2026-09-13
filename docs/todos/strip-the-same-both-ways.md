---
type: fix
spec: full-plan
status: ready
created: 2026-09-13
---

# The clone encoder strips undeclared keys inside a union, like its decoder

Extends the change that added `rjs`, the clone decoder that rebuilds each object from its declared
shape. That change fixed plain objects. Neither side of `clone` strips inside a union, and this
closes that on both ends at once.

## Problem

`clone` promises only what the type declares crosses the wire, and the website says it of both
directions. A union whose members are all JSON-compatible breaks the promise:

```ts
type Params = {a: string}[] | number;
// a caller posts [{a: 'x', evil: 1}] and the handler sees evil
```

`atomicOnlyJsonIdentity()` is `len(layout.ObjectMembers) == 0 && !layout.AtomicNeedsTuple`
(`union_flat_layout.go:357`). An ARRAY counts as an atomic member, so this union has no object
members, needs no envelope, and every arm gated on that predicate returns identity before it ever
compiles the array. The array's own arm would have cloned and stripped; the union short-circuits
above it.

Nothing else catches it. `validate` ignores undeclared keys on an object literal by design, which
is the whole reason `strictTypes` exists, so the key reaches the handler.

**A correction owed.** The `rjs` change recorded a "deliberate divergence" in which the new decoder
strips inside an all-atomic union while the encoder does not. It does not: the shipped code carries
the encoder's own early-out.

```go
// json_restore_safe.go:505 — emitUnionRestoreFromJsonSafe
if layout.atomicOnlyJsonIdentity() { return RTCode{Code: "", Type: CodeS} }
```

The gap was mirrored, not diverged from. That section of the `docs/done/` note describes behaviour
that was never implemented and is rewritten here.

### Who leaks

| family | strategy | deciding line | leaks? |
| --- | --- | --- | --- |
| `pjs` | clone encode | `json_prepare_safe.go:819` | yes |
| `rjs` | clone decode | `json_restore_safe.go:505` | yes |
| `sj` | direct encode | `union_flat.go:482`, hands the raw value to native stringify | yes |
| `cj` / `cjr` | compact | `union_flat_compact.go:94` widens `AtomicNeedsTuple`, because an object member is never noop under compact | no |
| `pj` / `rj` | mutate | `union_flat.go:161`, `:343` | yes, by design |

`sj` reads the same predicate, so it is fixed by the same edit. That is wanted: `direct` documents
"Dropped" for what it sends.

### What is NOT a gap, and why

**Index signatures do not strip, and should not.** A plain `[k: string]` declares every key, so
there is nothing undeclared to remove. For a pattern-keyed signature a non-matching key is not
stripped either, it is REFUSED by validation (`validate.go:1699`, inside
`emitIndexSignatureValidate` when the key type is a template literal):

```js
if (!reIdx.test(k)) return false;
```

So a stray key never reaches the handler whatever the decoder does. The compact decoder walking an
index-signature object in place (`json_compact_restore.go:182`) is therefore correct, not a bug.
The clone ENCODER does drop a non-matching key while building its clone
(`json_prepare_safe.go:461-470`), but only for a value that is already invalid against its own
type, so the asymmetry is cosmetic. Recorded here so nobody reopens it.

### Why it was not caught

`rjs`'s stripping contract has no fuzz coverage at all. The round-trip lane exercises it but never
plants an undeclared key, and the type walker produces ZERO positions for `{a: string}[] | number`
(`unknownKeyPositions.ts:181` returns before pushing when the value is not a plain record). The one
oracle that plants on the wire is switched off for these families and normalised for the other:

```js
// fuzzOracle.ts:533 — treats a blanked key and a deleted key as the same thing
strippedClean = withoutBlankedKeys(jsonDecode(wire));
// fuzzRunner.ts:196 — the wire oracle only ever runs against the default strip composite
```

## The fix: narrow the union gate, do not remove it

`isExtraProof` (`json_prepare_safe.go:616`, walk at `:633`) already means "no undeclared key can
hide in this subtree": true for primitives, literals, enums and template literals, recursing
through arrays, tuples and nested unions, everything else falling to `false`. Memoised under
`factExtraProof`, and its cycle fixpoint is `false`, which is the safe direction here (unknown
means walk).

`isJsonCompatible` and `unionMemberEnvelopes` are the wrong tools, and the codebase already says
why (`json_prepare_safe.go:600-606`): they describe the TYPE's transforms, while undeclared keys
are a property of the VALUE. `unionMemberEnvelopes` only inspects a member's top level, which is
exactly why an object one level down inside an array is invisible to it.

Add the conjunct as a FIELD on the layout, computed once in `buildFlatLayout`, read inside the
predicate:

```go
func (layout FlatLayout) atomicOnlyJsonIdentity() bool {
    return len(layout.ObjectMembers) == 0 && !layout.AtomicNeedsTuple && layout.AtomicsExtraProof
}
```

A field rather than a precomputed verdict, because `buildCompactFlatLayout`
(`union_flat_compact.go:92-98`) mutates `AtomicNeedsTuple` AFTER `buildFlatLayout` returns, so a
stored verdict would go stale while a stored conjunct stays correct. One edit fixes all three call
sites (`json_prepare_safe.go:819`, `json_restore_safe.go:505`, `union_flat.go:482`).

**Treat `any`, `unknown` and bare `object` members as extra-proof at this gate only.**
`extraProofRecursive` answers false for them, which would make `string | object` compile a dispatch
chain with nothing to strip. Do NOT add them to `extraProofRecursive` itself: that would flip
`emitArrayPrepareForJsonSafe:694` and start sharing `any[]` by reference, an aliasing change
somewhere unrelated.

**No new emitter code on either side.** Both member walks already exist and are simply skipped: the
encode side reaches `atomicEncodeDispatch` + `safeChildExpr` (`json_prepare_safe.go:829-844`), the
decode side reaches `emitBareUnionRestoreSafe` (`json_restore_safe.go:562`), which compiles each
member through `ctx.CompileChild` and routes the array member to the per-element rebuild.

**Do not narrow `union_flat.go:343`.** That gate belongs to `emitUnionRestoreFromJsonFlatLayout`,
shared with `rj`, and `rj` must keep extras.

### The predicate that must move with it

| predicate | today | after |
| --- | --- | --- |
| `isNoopForPrepareJsonSafe` (`noop_types.go:483`) | no union arm, falls through to `false` | no change, already conservative |
| `isNoopForStringifyJson` (`:682`) | same | no change |
| `isNoopForCompactFromJson` (`:814`) | `false`, the envelope is forced | no change |
| `isNoopForRestoreJsonSafe` (`:929-932`) | **`true`** | **must return `false`** |

`isNoopForRestoreJsonSafe` is the highest-risk edit here. `RestoreFromJsonSafeEmitter` declares
`NoopChildComposesAround()`, so it sits on the walker's dispatch gate: the moment the emit walks and
the predicate still says noop, the child call is replaced with empty code and the rebuild never runs
at any nested position. That is the false-positive direction the soundness contract at
`noop_types.go:20-28` calls data corruption.

Add the conjunct in the same hand-rolled style `anyUnionMemberEnvelopes` uses (`:942-957`): walk
`SafeUnionChildren`, skip `isStrippedUnionMember`, and never call `buildFlatLayout`, which emits
drop diagnostics a predicate must not duplicate.

**Do not touch `unionJsonNoop` (`:405`).** It is shared with the mutate engine (`:362`); changing it
would flip `pj` and `rj` to non-noop while their emits still return empty.

## The fuzz

### A wire oracle that asserts absence

`plantWireKeys` (`fuzzOracle.ts:584`) is type-blind on purpose and already writes into every plain
object of a parsed wire, arrays included, so it reaches inside union arms with no walker change.
What is missing is the family and the strictness:

- `FuzzTarget` gains the clone pair: `pjs` and `rjs`. `rjs` comes through a marker wrapper, and the
  recipe already exists in `roundtripHarness.ts:106-109`.
- A new oracle asserts the planted key is ABSENT, reusing `droppedKeyPaths`
  (`fuzzOracle.ts:601-638`, which already tests `Object.hasOwn`) instead of `withoutBlankedKeys`.
- Every call gets its own copy: `rjs` rebinds accessors and rewrites its input in place.
- `withoutBlankedKeys` stays for the existing composite, which still blanks by design.

### Let the type walker descend an unambiguous union

`unknownKeyPositions.ts:180-184` refuses to descend through a union, so the shape at the heart of
this todo yields no position at all. Descend into a member when `unionIsCarveOut` is false, exactly
one member is structurally compatible with the value's coarse class, no member is `any` or
`unknown`, and no candidate on the remaining path carries an index signature. That buys the same
coverage for `huk`, `uke` and `ces`.

Descending into a union where two object members both match the value stays refused, and that
refusal is correct rather than cautious: the fused validator follows the matched branch while the
unknown-key families use the merged allowlist, which is the library's own documented divergence.

The walker's index-signature carve-out stays as it is. Per the section above, a pattern-keyed
signature is a validation matter, not a stripping one.

### Exceptions that stay, and why

`extrasValue.ts`'s carve-outs (its reference interpreter throws on those shapes), `compactNullRisk`
(a real wire-format limit), the `divergesFromComposition` skip in `Strict.test.ts` (a documented
semantic divergence), and `withoutBlankedKeys` for the composite `strip` decoder.

## What changes on the wire

Nothing gains an envelope: every wrap site is gated on `AtomicNeedsTuple`, which this does not
touch. Three observable differences to accept deliberately rather than discover:

- **Key order** inside a nested object in a union member becomes DECLARED order instead of runtime
  insertion order. `{b: 1, a: 'x'}` currently serialises `{"b":1,"a":"x"}` and would serialise
  `{"a":"x","b":1}`. Semantically identical, byte-different. Every non-union position already
  behaves this way, so "byte-identical wire" is the wrong acceptance criterion and must not be
  written into a test.
- **Aliasing**: `pjs` currently returns the caller's array by reference and would allocate through
  `v.map`. Invisible through the composite, visible to a direct `getRTFunction<'pjs'>` consumer.
- A non-member value now hits the encode chain's `throw new Error(fuEncErr)` where it used to pass
  through. Encode side only; the decode side deliberately does not throw.

## Tests

- `union_flat_compact_test.go:142-145` asserts the clone encode of an atomic-only union "must stay
  identity" and passes only because it checks for the `[0,` envelope. It still passes, but the name
  and comment become false and must be rewritten as "must stay envelope-free".
- `noop_predicate_test.go` already carries `UArrObj = Compat[] | string` and fails fatally for
  `restoreFromJsonSafe` if the emit walks without the predicate change. That tripwire is the proof
  the two moved together; do not weaken it.
- There is NO Go table test for `isNoopForRestoreJsonSafe` anywhere. Add one, in the shape of the
  existing per-family tables in `noop_types_test.go`.
- Go fixtures for the shape across `pjs`, `rjs` and `sj`: an extra key on an object inside an array
  member of an all-atomic union does not survive, and a pure atomic union still emits nothing.
- `ExtraParams.ts` covers only a flat `{declared: string}`; add a union case so every strategy
  pairing sees it.
- A router arrival test for a union-typed param on a clone route, beside the ones added with `rjs`.

## Docs

No content change. The site already claims what this makes true
(`01.rpc/02.server/08.serialization.md:27`). Stated here so nobody edits the docs instead of the
code. The `docs/done/` note for the `rjs` change does need its divergence section rewritten.

## Out of scope

Compact needs nothing: it forces an envelope for this shape, so it already strips. Index signatures
need nothing, per the section above. The `strip` composite keeps blanking, `ukuw`'s own union
short-circuit (`unknownkeys_union.go:105-108`) is left alone, and `createParseFn` is untouched.

## Done when

An undeclared key on an object nested inside an all-atomic union survives neither direction for
`clone`; `direct` stops leaking it too, since it shares the gate; `mutate` still keeps extras both
ways; `rj` and compact are untouched; a pure atomic union still compiles to nothing; the noop
predicate and its emit moved together with the corpus test proving it; and the fuzz asserts absence
rather than blankness for the clone pair.
