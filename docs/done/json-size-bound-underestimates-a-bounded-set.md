---
type: fix
spec: guidelines
status: done
created: 2026-09-12
---

# jsonMaxBytes underestimates a union of object members

## Intent

`jsonMaxBytes` is supposed to be a true upper bound on what the compiled JSON encoder emits for a
type, so a consumer deriving a request size limit from it never rejects a payload the encoder
itself produced. For a union of two or more object members it was not, and the `jsonsize` fuzz
lane's soak caught it on a bounded `Set`.

## What failed

The soak reported three violations on CI run 34719842695 (job 103623691959), all the same type and
the same per-type seed (2646330014), differing only in the Date the mock drew:

```
[jsonsize-fuzz][JS-MAX-ENCODER] [1d] Set<({2}|{3}|{3}|{1})>≤1 (seed=2646330014):
the compiled JSON encoder emits 70 bytes, over the type's jsonMaxBytes 68
    [[-1,{"kind":"t2","f0":[2,null],"f1":[1,"1995-03-12T13:06:34.149Z"]}]]
```

## The cause

Not the Set, and not the union's own `[-1, …]` envelope: both were already budgeted. The flat-union
encoder merges a union's OBJECT members into one wire shape whose every property is the union of
that name across the arms (`ts-go-runtypes/internal/cachegen/typefunctions/union_flat_layout.go`).
A property two arms declare with different types therefore rides as `[<candidateIndex>,value]`.

In the reported type, `f0` is declared by three arms and `f1` by two, so the encoder wrote
`"f0":[2,null]` and `"f1":[1,"…"]` where the walk had sized a bare `null` and a bare Date. The
`jsonsize` walk sizes each union member on its own and knew nothing about that merge, so it lost
4 bytes per merged property.

Nothing about this is specific to a sized container. With the fix reverted, the same undercount
fires for a `Set` item, a `Map` key, an array element and a bare union root; a `Map` value only
escaped because a generous key bound absorbed the gap.

## What shipped

`ts-go-runtypes/internal/cachegen/jsonsize/jsonsize.go` — `unionBytes` now counts the union's
mergeable members (object literals and intersections; every other member keeps its own
`[index,value]` arm, and a bounded class member like Date / Map / Set is always atomic). When two
or more merge, each member's size gains one sub-envelope per direct data property:

```go
size := result.Bytes
if mergeable > 1 {
    size += w.mergedPropCount(w.deref(member)) * subEnvelopeBytes(mergeable)
}
```

`subEnvelopeBytes(candidates)` is `[` + the widest candidate index + `,` + `]`. A merged property
holds at most one candidate per object member, and the sub-wrap index is always a plain 0-based
one (`emitMergedPropStringify`), never the object branch's `-1`.

Charging every property of every mergeable member, rather than only the ones the emitter really
wraps, is the same worst case the outer envelope already takes: the walk cannot see the emitter's
layout decision, and the number is a bound, not a size. The reported type's bound goes from 68 to
80 against the encoder's 70.

## Tests

- `ts-go-runtypes/internal/cachegen/jsonsize/jsonsize_test.go` —
  `TestMaxBytes_UnionMergedProps` pins the arithmetic for a two-object union, for a union with a
  single object member (no sub-envelope, the arm size stands) and for a `Set` of the merged union.
- `packages/run-types/test/fuzz/type/unionMergedPropJsonSize.smoke.test.ts` — compiles the reported
  four-arm shape as a `Set` item, a `Map` value, a `Map` key, an array element and a bare root, and
  checks the real encoder's UTF-8 output against the bound the build wrote. Each case carries its
  own literal tags: identical shapes share a node id, and a nested union's row has no bound.

Both fail with the surcharge removed.

## Not changed

The fuzz lane's own shape. It did its job: it found a real undercount and printed a replayable
per-type seed. Making the soak's exploration deterministic across machines is a separate concern.
