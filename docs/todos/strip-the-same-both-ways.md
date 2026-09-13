---
type: fix
spec: full-plan
status: ready
created: 2026-09-13
---

# A stripping strategy strips the same on both ends

## Problem

`clone` and `compact` promise that only what the type declares crosses the wire, and the website
says it of both directions: "clone and compact rebuild the value from your type on the way in, so a
key your type does not declare never reaches your handler". Two shapes break that promise today,
and they are the two shapes the undeclared-key fuzz cannot reach.

**A correction first.** The change that added `rjs` recorded a "deliberate divergence" in which the
new decoder strips inside an all-atomic union while the encoder does not. It does not: the shipped
code carries the encoder's own early-out.

```go
// json_restore_safe.go:505 — emitUnionRestoreFromJsonSafe
if layout.atomicOnlyJsonIdentity() { return RTCode{Code: "", Type: CodeS} }
```

The gap was mirrored, not diverged from. That section of the `docs/done/` note describes behaviour
that was never implemented and is rewritten as part of this work.

### Gap 1, pattern-keyed index signatures on the compact decoder

An index signature with a template-literal key admits only the keys it matches; the rest are
undeclared. Every family models that, except the compact decoder, in two places:

```go
// json_compact.go:281         encode → emitObjectPrepareForJsonSafe, which drops a non-matching key
// json_compact_restore.go:182 decode → emitObjectJsonChildren, an in-place walk that drops nothing
// json_compact_restore.go:130 decode of a BARE Record root → rj's in-place arm, which `continue`s
//                             past a non-matching key and leaves it on the object
```

So for ``{[k: `x_${string}`]: string}`` under compact, encoding `{x_a: '1', evil: '2'}` writes
`{x_a: '1'}` and decoding the same object returns it whole. A plain `[k: string]` admits every key,
so the gap is specific to pattern-keyed signatures and to objects carrying a dropped declared
member.

### Gap 2, objects hiding inside an all-atomic union

`atomicOnlyJsonIdentity()` is `len(layout.ObjectMembers) == 0 && !layout.AtomicNeedsTuple`
(`union_flat_layout.go:357`). An array is an ATOMIC member, so `{a: string}[] | number` has no
object members, needs no envelope, and every arm gated on that predicate returns identity before it
ever compiles the array. The array's own arm would have stripped; the union short-circuits above it.

Which families actually leak, verified per arm:

| family | deciding line | leaks? |
| --- | --- | --- |
| `pjs` clone encode | `json_prepare_safe.go:819` | yes |
| `rjs` clone decode | `json_restore_safe.go:505` | yes |
| `sj` direct encode | `union_flat.go:482`, hands the raw value to native stringify | yes |
| `ukuw`, the default `strip` decoder | `unknownkeys_union.go:105-108`, no merged props means no sweep | yes |
| `cj` / `cjr` compact | `union_flat_compact.go:94` widens `AtomicNeedsTuple` because an object member is never noop under compact | **no**, for this shape |
| `pj` / `rj` mutate | `union_flat.go:161`, `:343` | yes, by design, the control |

Compact escapes the array shape but not the record one: for ``Record<`k${string}`, number> | number``
the index-signature object also lands in the atomic bucket, `compactUnionMemberTransforms` finds no
transform in a number-valued signature, so no envelope is forced and `cj` and `cjr` leak the
pattern-mismatched keys along with everyone else.

### Why neither was caught

`rjs`'s stripping contract has no fuzz coverage at all. The round-trip lane exercises it but never
plants an undeclared key, and the type walker produces ZERO positions for `{a: string}[] | number`
(`unknownKeyPositions.ts:181` returns before pushing when the value is not a plain record). The two
places that could have seen it are both switched off:

```js
// fuzzOracle.ts:533 — normalises away the difference between blanked and deleted
strippedClean = withoutBlankedKeys(jsonDecode(wire));
// fuzzRunner.ts:196 — turns the wire oracle OFF for any target carrying a carve-out
if (!positions.some((position) => position.kind === 'carveOut')) { ... }
```

## Fix 1: narrow the union gate, do not remove it

`isExtraProof` (`json_prepare_safe.go:616`, walk at `:633`) already means "no undeclared key can
hide in this subtree": true for primitives, literals, enums and template literals, recursing
through arrays, tuples and nested unions, everything else falling to `false`. Memoised under
`factExtraProof`, and its cycle fixpoint is `false`, which is the safe direction here (unknown
means walk).

`isJsonCompatible` and `unionMemberEnvelopes` are the wrong tools and the codebase already says why
(`json_prepare_safe.go:600-606`): they describe the TYPE's transforms, while undeclared keys are a
property of the VALUE. `unionMemberEnvelopes` only inspects a member's top level, which is exactly
why an object one level down inside an array is invisible to it.

Add the conjunct as a FIELD on the layout, computed once in `buildFlatLayout`, and read it inside
the predicate:

```go
func (layout FlatLayout) atomicOnlyJsonIdentity() bool {
    return len(layout.ObjectMembers) == 0 && !layout.AtomicNeedsTuple && layout.AtomicsExtraProof
}
```

A field rather than a precomputed verdict, because `buildCompactFlatLayout`
(`union_flat_compact.go:92-98`) mutates `AtomicNeedsTuple` AFTER `buildFlatLayout` returns, so a
stored verdict would go stale while a stored conjunct stays correct. This also leaves all three
call sites untouched (`json_prepare_safe.go:819`, `json_restore_safe.go:505`, `union_flat.go:482`),
so `pjs`, `rjs` and `sj` are fixed by one edit.

**Treat `any`, `unknown` and bare `object` members as extra-proof at this gate only.**
`extraProofRecursive` answers false for them, which would make `string | object` compile a dispatch
chain with nothing to strip. Do NOT add them to `extraProofRecursive` itself: that would flip
`emitArrayPrepareForJsonSafe:694` and start sharing `any[]` by reference, an aliasing change
somewhere unrelated.

**No new emitter code is needed on either side.** Both member walks already exist and are simply
being skipped: the encode side reaches `atomicEncodeDispatch` + `safeChildExpr`
(`json_prepare_safe.go:829-844`) and the decode side reaches `emitBareUnionRestoreSafe`
(`json_restore_safe.go:562`), which compiles each member through `ctx.CompileChild` and routes the
array member to the per-element rebuild.

**Do not narrow `union_flat.go:343`.** That gate belongs to `emitUnionRestoreFromJsonFlatLayout`,
which `rj` shares, and `rj` must keep extras.

### The predicate that must move with it

| predicate | today | after |
| --- | --- | --- |
| `isNoopForPrepareJsonSafe` (`noop_types.go:483`) | no union arm, falls through to `false` | no change, already conservative |
| `isNoopForStringifyJson` (`:682`) | same | no change |
| `isNoopForCompactFromJson` (`:814`) | `false`, the envelope is forced | no change |
| `isNoopForRestoreJsonSafe` (`:929-932`) | **`true`** | **must return `false`** |

`isNoopForRestoreJsonSafe` is the single highest-risk edit in this change. `RestoreFromJsonSafeEmitter`
declares `NoopChildComposesAround()`, so it sits on the walker's dispatch gate: the moment the emit
walks and the predicate still says noop, the child call is replaced with empty code and the rebuild
never runs at any nested position. That is the false-positive direction the soundness contract at
`noop_types.go:20-28` calls data corruption.

Add the third conjunct in the same hand-rolled style `anyUnionMemberEnvelopes` uses (`:942-957`):
walk `SafeUnionChildren`, skip `isStrippedUnionMember`, and never call `buildFlatLayout`, which
emits drop diagnostics a predicate must not duplicate.

**Do not touch `unionJsonNoop` (`:405`).** It is shared with the mutate engine (`:362`); changing it
would flip `pj` and `rj` to non-noop while their emits still return empty.

## Fix 2: the compact decoder strips pattern-keyed signatures

Both compact decode index-signature branches switch to the conditional rebuild `rjs` already owns
(`indexSigAdmitsEveryKey` to delegate, else `emitIndexSigObjectRebuildFromJson` / the bare-record
rebuild, all in `json_restore_safe.go`):

- `json_compact_restore.go:182`, an object carrying an index signature
- `json_compact_restore.go:130`, a bare pattern-keyed `Record` root

Clean reuse, because those helpers recurse through `ctx.CompileChild`, which routes to the current
emitter. Verified on the encode side: `emitObjectCompactForJson` calls the pjs clone and its
children still compile through `cj` via `safeChildExpr` (`json_prepare_safe.go:222-224`). So nested
objects stay positional under `cjr`, symmetric with the encode.

The pattern-keyed record INSIDE a union (`` Record<`k${string}`, number> | number ``) is fixed by
Fix 1, not here: once the union stops short-circuiting, the member compiles and reaches this arm.

## Fix 3: the fuzz, in two layers

### 3a. A wire oracle that asserts absence

`plantWireKeys` (`fuzzOracle.ts:584`) is type-blind on purpose and already writes into every plain
object of a parsed wire, arrays included, so it reaches inside union arms and index-signature
objects with no walker change. What is missing is the family and the strictness:

- `FuzzTarget` gains the stripping decoders: `rjs` through a marker wrapper (the recipe is in
  `roundtripHarness.ts:106-109`, and the value suite already has the identical pattern for `rj`)
  and the compact decoder.
- A new oracle id asserts the planted key is ABSENT, reusing `droppedKeyPaths`
  (`fuzzOracle.ts:601-638`, which already tests `Object.hasOwn`) instead of `withoutBlankedKeys`.
- Every call gets its own copy: `rjs` rebinds accessors and rewrites its input in place.
- `fuzzRunner.ts:196` becomes "skip only for an admits-every-key signature" rather than for any
  carve-out.

### 3b. Extend the type walker

- **Index signatures.** `hasIndexSignature` (`unknownKeyPositions.ts:106-112`) is a kind test that
  never reads `node.index`, so a pattern-keyed signature is wrongly labelled `carveOut`. All five
  families do model the pattern (`unknownkeys_has.go:365`, `unknownkeys_errors.go:170`,
  `unknownkeys_to_undefined.go:157`, `json_prepare_safe.go:461`, `json_restore_safe.go:290`).
  Replace the boolean with a three-way classifier: admits-every-key stays `carveOut`, pattern-keyed
  becomes `flagged`, mixed stays `carveOut`. Add a pattern-keyed target to
  `fuzz.integration.test.ts`, which has none.
- **Unions.** Descend into a member when `unionIsCarveOut` is false, exactly one member is
  structurally compatible with the value's coarse class, no member is `any` or `unknown`, and no
  candidate on the remaining path carries an index signature. That reaches the array-union shape
  for `huk`, `uke` and `ces` too. Descending into a union where two object members both match the
  value stays refused, and that refusal is correct rather than cautious: the fused validator
  follows the matched branch while the unknown-key families use the merged allowlist, which is the
  library's own documented divergence.

**Expect a finding.** For symbol-keyed and function-valued signatures `uke` reports nothing while
`ces` drops the key, a latent disagreement no current target exercises. If it fires it is
pre-existing and not about stripping: fix it here only if it sits on this path, otherwise delegate
it rather than widening this change.

### Exceptions that stay, and why

`extrasValue.ts`'s carve-outs (its reference interpreter throws on those shapes), `compactNullRisk`
(a real wire-format limit), the `divergesFromComposition` skip in `Strict.test.ts` (a documented
semantic divergence), and `withoutBlankedKeys` for the composite `strip` decoder, which still
blanks by design and is out of scope.

## What changes on the wire

Nothing gains an envelope: every wrap site is gated on `AtomicNeedsTuple`, which this does not
touch. Two observable differences to accept deliberately rather than discover:

- **Key order** inside a nested object in a union member becomes DECLARED order instead of runtime
  insertion order. `{b: 1, a: 'x'}` currently serialises `{"b":1,"a":"x"}` and would serialise
  `{"a":"x","b":1}`. Semantically identical, byte-different. Every non-union position already
  behaves this way, so this makes the union consistent rather than novel, but "byte-identical wire"
  is the wrong acceptance criterion and should not be written into a test.
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
- Go fixtures per family for both gaps: the array union across `pjs`, `rjs`, `sj`, `cj`, `cjr`, and
  a pattern-keyed index-signature object and bare record under `cjr`.
- `pattern_props_codec_test.go` grows from "the regex is hoisted" to "a non-matching key does not
  survive".
- `ExtraParams.ts` covers only a flat `{declared: string}`; add a union case and an
  index-signature case so every strategy pairing sees both shapes.
- A router arrival test for a union-typed param on a clone route.

## Docs

No content change. The site already claims what this makes true
(`01.rpc/02.server/08.serialization.md:27`). Stated here so nobody edits the docs instead of the
code. The `docs/done/` note for the `rjs` change does need its divergence section rewritten.

## Out of scope

`direct` leaks on the same union shape (`union_flat.go:482`) and is fixed for free by the shared
gate, but its OTHER stripping gaps are not in question here. The `strip` composite keeps blanking.
`ukuw`'s own union short-circuit (`unknownkeys_union.go:105-108`) is left alone: it feeds the
blanking decoder and `createParseFn`, neither of which is being changed.

## Done when

An undeclared key survives neither direction for `clone` or `compact`, on a plain object, inside a
pattern-keyed index-signature object and bare record, and inside an all-atomic union; `mutate`
still keeps extras both ways; `rj` is untouched; a pure atomic union still compiles to nothing; the
noop predicate and its emit moved together with the corpus test proving it; and the fuzz asserts
absence rather than blankness for the families that delete.
