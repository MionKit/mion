---
type: fix
spec: full-plan
status: done
created: 2026-09-14
---

# Every family that strips or reports undeclared keys answers the same

Seven public functions answer one question: which keys on this value are not declared by the type?
Three of them disagreed, each at a different position, and nothing held them against each other.

## What disagreed

An undeclared `evil` key, fed to each family. The bold cells are what this fixed:

| shape | `huk` | `uke` | `vst` | `ces` | `pjs` / `rjs` / `sj` | `cj` | `strip` decoder |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{a: string}` | reports | reports | rejects | strips | strips | strips | strips |
| `{a: string}[]` | reports | reports | rejects | strips | strips | strips | strips |
| `[{a: string}, number]` | reports | reports | rejects | strips | strips | strips | **kept** |
| `{t: [{a: string}, number]}` | reports | reports | rejects | strips | strips | strips | **kept** |
| `{a: string}[] \| number` | **missed** | **missed** | rejects | strips | strips | strips | **kept** |
| `[{a: string}, number] \| string` | **missed** | **missed** | rejects | strips | strips | strips | **kept** |

Both leaks faced UNTRUSTED input: the `strip` decoder is what a server runs on a caller's payload,
and `validate` accepts undeclared keys on an object literal by design, which is the whole reason
`strictTypes` exists.

## Cause 1: the strip pre-pass opted out at a tuple

`emitTupleUnknownKeysToUndefined` returned nothing on purpose, on the reasoning that "the safe
encoder strips extras at encode time so the safe decode pipeline doesn't need this step". That is
not what a decoder faces: a caller who never used our encoder sends whatever it likes.

The arm it needed was already shipped and already used by the errors family, one guard and all:

```go
func emitTupleUnknownKeysToUndefined(rt *reflection.RunType, ctx *EmitContext) RTCode {
	return emitTupleUnknownKeysRecurse(rt, ctx)
}
```

The circular-tuple worry that justified the no-op is answered by that arm's single
`Array.isArray` guard plus the walker's cycle handling, which is why the errors family never
tripped on it. A Go test with a self-referential optional tuple slot pins that, so the no-op is not
reintroduced as a fix for a problem that is already solved.

## Cause 2: nothing walked an ATOMIC union member

`emitUnionUnknownKeysMerged` returned as soon as the union contributed no merged props. True for a
primitive, false for an array or a tuple: in the flat union layout those are ATOMIC members, and
they hold whatever their element type declares.

New: `unionAtomicMemberDescent` walks them, reusing `atomicStructuralGuard` (the same guard the
encoders dispatch on) rather than hand-rolling one, and emitting only for members `isExtraProof`
does not already clear, so `string | number` still compiles to nothing. On an enveloping wire the
member arrives as `[index, value]`, so the arm keys on the index instead, exactly like
`unionClassMemberWireStrip`.

The rendering moved into `finishUnionUnknownKeys`, shared by both exits. The merged body and the
descent sit SIDE BY SIDE rather than nested: the merged body walks the union's own keys under the
`v[0] === -1` envelope gate, the descent carries its own per-member guard. When there is no descent
the output is byte-identical to before.

**The noop predicates moved with the emit.** These families sit on the walker's dispatch gate, so a
predicate answering "noop" while the emit walks replaces the child call with empty code. Two edits:
`unknownKeysNoopSpec.tupleAlwaysNoop` is gone, and `unknownKeysNoopUnion` gained the atomic-member
conjunct. The resolver's noop corpus test caught the union half unprompted, naming the exact fixture
(`UArrObj`) before the predicate was touched, which is the whole point of that test.

## Cause 3, which cause 1 uncovered: the object arm had no shape guard

`unknownKeysObjectGuard` is documented as "the shape precondition every OBJECT-node unknown-keys
emit runs under", and `emitObjectUnknownKeysToUndefined` was the one that did not run under it.
Nothing could reach it with a non-object while the family stopped at tuples, so the omission was
invisible. Walking tuple slots made `interface Self { list: [string, Self?] }` reachable:

```
TypeError: Cannot read properties of null (reading 'list')
```

The slot arm already skips an `undefined` slot, but a JSON wire writes an absent optional as
`null`, which sails past that check and lands on the object node, whose key scan then reads
`v.list` off it. Fixed by wrapping the arm in the same guard the other three families use, and
pinned by a Go test on that exact shape.

## Not a gap, recorded so nobody reopens it

- **The strict validator names the union, not the key.** `getValidationErrors` with
  `{checkUnknowns: true}` answers `[{expected: 'union', path: []}]` for every union: it detects by
  branch failure rather than through the merged allowlist. Not specific to these shapes (a plain
  union of object literals answers the same, and one nested in a property gives
  `path: ['u']`), so changing it changes how every union failure is reported, for every cause. The
  verdict always agreed; only the path is coarse. Pinned by a test.
- **`cloneExactShape` refuses a union with object members** (`CES001`). Documented and deliberate: a
  clone built from the declared shape needs to know which arm the value matched, and silently
  keeping unknown keys would defeat its guarantee, so the build fails instead. It is the one family
  allowed to answer "cannot", and it keeps saying so loudly.
- **Index signatures do not strip.** A plain `[k: string]` declares every key. A pattern-keyed one
  refuses a non-matching key at validation, so a stray key never reaches a handler whatever the
  decoder does.

## The oracle that should have caught this, and now does

Six unknown-key oracles ran green over these shapes because the walker that decides where to plant
a key returned ZERO positions for them, and an oracle with nothing to check passes.

**O27, a coverage assertion, is the part that makes the rest stick.** A target whose TYPE carries a
keyed shape ANYWHERE must have been planted in at least once across the run. The root's own kind is
irrelevant: `containsKeyedShape` walks the whole tree, so an array, a tuple, a union, a Map or a Set
all count when they carry an object further down. It is answered per target over the whole run, not
per value, because one value legitimately reaches nowhere (a union's number arm holds no object);
what cannot happen is a target that never once offered a position.

Verified by reverting the walker fix: O27 then names `AtomicOnlyUnion` and nothing else does.

Two supporting changes:

- The walker now descends into a union when ONE member could have produced the value:
  `unionIsCarveOut` false, exactly one member structurally compatible with the value's coarse class
  (array and tuple share one class, since telling them apart takes a length check the walker has no
  business doing), no `any` / `unknown` / nested-union / ref member, and no index signature on the
  remaining path. Two members of the same coarse class stays REFUSED, and that refusal is correct
  rather than cautious, so O27 exempts such a target through `unknownKeyWalkerBlind`.
- Two corpus targets for the shapes that were missing: `AtomicOnlyUnion` and `ObjectInTupleSlot`.

## Tests

- `unknownkeys_atomic_member_test.go`: the union walks its array member, the strip pre-pass walks
  its tuple slots, the object node behind a circular optional tuple slot carries its shape guard,
  and a pure atomic union still emits nothing. Each fails against its own reverted fix; the pure
  atomic one asserts nothing changed and correctly keeps passing.
- `noop_types_test.go`: `uArrObjStr` and `tupObj` now answer the same for all four unknown-keys
  families.
- `packages/run-types/test/features/unknownKeyFamiliesAgree.test.ts`: the table above as a suite,
  one row per position, every family asserted on the same value, plus the two pinned non-gaps.
- `ExtraParams.ts` gains a union case and a tuple case, so all ten strategy pairings see both.

## Done when

Every row of the table agrees; a union of primitives and a tuple of primitives still compile to
nothing; each noop predicate moved with its emit; and the fuzz fails rather than goes quiet when the
walker cannot reach a keyed shape.
