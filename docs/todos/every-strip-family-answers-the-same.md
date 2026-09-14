---
type: fix
spec: full-plan
status: ready
created: 2026-09-14
---

# Every family that strips or reports undeclared keys answers the same

Seven public functions answer one question: which keys on this value are not declared by the type?
Three of them disagree, each at a different position, and nothing holds them against each other.

## What disagrees today

An undeclared `evil` key on the object, fed to each family:

| shape | `huk` | `uke` | `vst` | `ces` | `pjs` / `rjs` / `sj` | `cj` | `strip` decoder |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{a: string}` | reports | reports | rejects | strips | strips | strips | strips |
| `{a: string}[]` | reports | reports | rejects | strips | strips | strips | strips |
| `[{a: string}, number]` | reports | reports | rejects | strips | strips | strips | **keeps** |
| `{t: [{a: string}, number]}` | reports | reports | rejects | strips | strips | strips | **keeps** |
| `{a: string}[] \| number` | **misses** | **misses** | rejects, path `[]` | strips | strips | strips | **keeps** |
| `[{a: string}, number] \| string` | **misses** | **misses** | rejects, path `[]` | strips | strips | strips | **keeps** |

Reproduces today:

```ts
type Tup = [{a: string}, number];
createJsonDecoderFn<Tup>(undefined, {strategy: 'strip'})('[{"a":"x","evil":1},2]');
// [{a: 'x', evil: 1}, 2]   <- evil survives

type Uni = {a: string}[] | number;
createHasUnknownKeysFn<Uni>()([{a: 'x', evil: 1}]);   // false   <- wrong
createUnknownKeyErrorsFn<Uni>()([{a: 'x', evil: 1}]); // []      <- wrong
createJsonDecoderFn<Uni>(undefined, {strategy: 'strip'})('[{"a":"x","evil":1}]');
// [{a: 'x', evil: 1}]      <- evil survives
```

Both leaks face UNTRUSTED input: the `strip` decoder is what a server runs on a caller's payload.
`validate` ignores undeclared keys on an object literal by design, which is the whole reason
`strictTypes` exists, so nothing downstream catches them.

## Cause 1: the strip pre-pass opted out at a tuple

`emitTupleUnknownKeysToUndefined`
(`ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_to_undefined.go:123`) returns nothing
on purpose:

```go
// uku at a tuple node is a no-op. The per-position concat pattern
// blindly recurses into every child slot, which breaks on circular
// tuples ... The safe encoder strips extras at encode time
// (prepareForJsonSafe clones the declared shape only) so the safe
// decode pipeline doesn't actually need this step to converge.
```

The last sentence is the error, and it is the same one the clone decoder was just fixed for: our
encoder is not what a decoder faces. A caller who never used it sends whatever it likes.

The arm this needs already exists and is already shipped: `emitTupleUnknownKeysRecurse`
(`unknownkeys_shared.go:699`) is what the errors family uses, and it guards on
`unknownKeysArrayGuard` before touching a slot. The circular-tuple worry is answered by that guard
plus the walker's own cycle handling, which is why the errors family does not trip on it.

Fix: call the shared arm. Keep a Go test with a self-referential optional tuple slot, so the reason
the no-op was written stays pinned rather than re-discovered.

## Cause 2: nothing walks an ATOMIC union member

`emitUnionUnknownKeysMerged` (`unknownkeys_union.go:105`) returns as soon as the union contributes no
merged props:

```go
// Atomic-only union — atomic primitives carry no keys; the family
// has nothing to do beyond the class arms.
if len(mergedProps) == 0 {
    return RTCode{Code: classArms, Type: opts.CodeShape}
}
```

True for a primitive, false for an array or a tuple: in the flat union layout those are ATOMIC
members, and they can hold an object. `unionMergedPropDescent` (`:262`) walks the object members'
properties, so even a union that DOES have object members still misses a key inside its array
member.

Fix: descend into atomic members as well, reusing `layout.atomicEncodeDispatch`
(`union_flat_layout.go:327`) for the ordered per-member runtime guards rather than hand-rolling
them, and emitting only for members that are not `isExtraProof` so a union of primitives still
compiles to nothing. Three code shapes ride this one emitter: `huk` is `CodeE` (returns a boolean),
`uke` and the strip pre-pass are `CodeS`; the strip pre-pass also has a `wireFormat` branch (`:92`)
that must keep its behaviour for an enveloping union.

**The noop predicates move with the emit.** These families sit on the walker's dispatch gate, so a
predicate still answering "noop" while the emit walks replaces the child call with empty code and
the walk never runs at a nested position. That is the false-positive direction the soundness
contract at `noop_types.go:20-28` calls data corruption. Each family's `isNoopFor*` needs the
matching conjunct, hand-rolled over `SafeUnionChildren` in the style `anyUnionMemberEnvelopes` uses:
skip `isStrippedUnionMember`, never call `buildFlatLayout` (it emits drop diagnostics a predicate
must not duplicate).

## The error path, while we are in there

For the union shapes the strict validator returns the right verdict with a useless path:

```js
createGetValidationErrorsFn<Uni>(undefined, {checkUnknowns: true})([{a: 'x', evil: 1}]);
// [{expected: 'union', path: []}]   instead of   [{expected: 'never', path: [0, 'evil']}]
```

It is detecting by branch failure (every arm rejects, so the union rejects), not through the merged
allowlist. Once `uke` reports the key, the fused strict validator should carry the same path, so
this is a consequence of cause 2 rather than a separate fix. Pin it with a test either way.

## Not a gap, recorded so nobody reopens it

- **`cloneExactShape` refuses a union with object members** (`CES001`). That is documented and
  deliberate: a clone built from the declared shape needs to know which arm the value matched, and
  silently keeping unknown keys would defeat its guarantee, so the build fails instead. It is the
  one family allowed to answer "cannot", and it must keep saying so loudly rather than quietly
  agreeing.
- **Index signatures do not strip.** A plain `[k: string]` declares every key. A pattern-keyed one
  refuses a non-matching key at validation (`validate.go:1699`), so a stray key never reaches a
  handler whatever the decoder does.

## The oracle that should have caught this

The value fuzz has unknown-key oracles (O19 to O26) and a walker that decides where to plant. The
walker is why they proved nothing here:

```ts
// unknownKeyPositions.ts:180-184
if (k === kind.union) {
  if (!isPlainRecordValue(value)) return;   // an array-valued union yields ZERO positions
  out.push({path, kind: unionIsCarveOut(node) ? 'carveOut' : 'flagged'});
  return;                                    // never descend
}
```

Zero positions means every oracle runs green while checking nothing. Four parts, in this order:

### 1. A coverage assertion, so silence is a failure

This is the part that makes the rest stick. A type whose tree contains a keyed shape (an object
literal or a plain class) ANYWHERE must yield at least one plantable position. The root's own kind
is irrelevant: an array, a tuple, a union, a Map or a Set can all carry one further down.

Add a predicate over the runtype tree, `containsKeyedShape(runType)`, and assert per target:

```
containsKeyedShape(target.schema) === (collectUnknownKeyPositions(target.schema, value).length > 0)
```

A target with no keyed shape anywhere is exempt and must stay at zero. Anything else that yields
nothing is a walker hole, reported as a violation rather than skipped. Run it on the valid mock of
every target, every seed.

### 2. Let the walker descend an unambiguous union

Descend into a member when `unionIsCarveOut` is false, exactly one member is structurally compatible
with the value's coarse class (array and tuple share one class: telling them apart takes a length
check the walker has no business doing), no member is `any`, `unknown`, a nested union or a ref, and
no candidate on the remaining path carries an index signature.

Two object members that both match the value stays REFUSED, and that refusal is correct rather than
cautious: the fused validator follows the branch it matched while these families read the merged
allowlist, which is the library's own documented divergence. The coverage assertion above must
therefore exempt that case explicitly, not paper over it.

### 3. Corpus targets for the shapes that were missing

`fuzz.integration.test.ts` has no target where an object hides inside an atomic member. Add:

- `RT.union([RT.array(RT.object({a: TF.string()})), TF.number()])`
- `RT.tuple({required: [RT.object({a: TF.string()}), TF.number()]})`

With the fix absent they fail O23, O24 and O25. O26 (the stripping decoder) already passes on the
union one, which is the encode and decode pair that was fixed separately.

### 4. The serialization suite case

`packages/run-types/test/suites/serialization/ExtraParams.ts` covers only a flat
`{declared: string}`. Add a union case and a tuple case. They need this fix first: the
`mutate - strip` pairing shares `getTestDataForStringify` with the clone and direct pairings, so
today those want the extra gone while `mutate - strip` still sees it, and no single expectation can
hold both.

## Tests

- Go, per family, over the union and tuple shapes: emitted-code assertions scoped to the entry line
  under test (a per-entry array or object factory carries rebuild code regardless, so an unscoped
  match passes without the fix; verify every new assertion A/B against a reverted fix).
- A Go table test for each family's `isNoopFor*` union arm, in the shape of the existing per-family
  tables in `noop_types_test.go`.
- A circular optional tuple slot, so the reason the tuple no-op existed stays pinned.
- The JS matrix above as a single suite: one type per row, every family asserted to agree.

## Done when

Every row of the table agrees; the strict validator reports the key's real path; a union of
primitives and a tuple of primitives still compile to nothing; each noop predicate moved with its
emit; the fuzz walker finds a position in every target that contains a keyed shape and the coverage
assertion fails when it does not; and the serialization suite carries the union and tuple cases.
