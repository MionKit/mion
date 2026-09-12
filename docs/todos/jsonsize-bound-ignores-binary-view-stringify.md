---
type: fix
spec: guidelines
status: ready
created: 2026-09-12
---

# jsonMaxBytes and the jsonsize lane disagree about a binary view

## Intent

The `jsonsize` fuzz lane holds `jsonMaxBytes` to TWO oracles: `JS-MAX-ENCODER` (the compiled JSON
encoder's real output) and `JS-MAX-STRINGIFY` (`JSON.stringify` of the raw value). A type carrying
a typed array, an `ArrayBuffer`, a `SharedArrayBuffer` or a `DataView` satisfies the first and
fails the second, and it has no length bound to fall back on. Decide which value the bound is
promising to cover and make the two agree.

## What fails

A 7 minute soak (`MION_FUZZ_JSONSIZE_SOAK_MS=420000 pnpm miondevx core fuzz jsonsize`) over 3700
types reported 22 violations, all `JS-MAX-STRINGIFY`, none `JS-MAX-ENCODER`:

```
[jsonsize-fuzz][JS-MAX-STRINGIFY] [1d] N0 (seed=2010557748): JSON.stringify is 44 bytes, over the type's jsonMaxBytes 31
    {"p0":{"0":1,"1":2,"2":3},"p1":null,"p2":{}}
[jsonsize-fuzz][JS-MAX-STRINGIFY] ({3}&{1}) (seed=1115569936): JSON.stringify is 85 bytes, over the type's jsonMaxBytes 78
    {"m0_0":"1975-06-09T10:20:04.238Z","m0_1":{"0":1,"1":2,"2":3},"m0_2":true,"m1_0":{}}
```

`{"0":1,"1":2,"2":3}` is `JSON.stringify(new Uint8Array([1,2,3]))`, and `{}` is a raw buffer or a
`DataView`.

This predates the merged-property fix that found it: that change only ever ADDS bytes to a bound,
and none of the reported types is a union of object members.

## The disagreement, minimised

```
=== {p0:Uint8Array} bound 11 | stringify {"p0":{"0":1,"1":2,"2":3}} | encoder {}
=== {p0:ArrayBuffer} bound 11 | stringify {"p0":{}}                 | encoder {}
=== {p0:DataView}   bound 11 | stringify {"p0":{}}                  | encoder {}
```

The encoder DROPS the member (DataOnly strips every binary view), so the wire carries nothing for
it and the bound's 4 bytes cover it with room to spare. `JSON.stringify` of the raw JS value keeps
it, and a typed array stringifies to one `"<index>":<number>` pair per element with no maximum the
type declares.

The walk's arm is in `ts-go-runtypes/internal/cachegen/jsonsize/jsonsize.go`:

```go
case reflection.SubKindNonSerializable:
	return bounded(nullBytes)
```

Its neighbours (`KindFunction`, `KindSymbol`, `KindPromise`) carry the comment "JSON.stringify
drops these: absent in an object, `null` in an array", which is true for those kinds and false for
a binary view. So the two oracles were only ever in agreement by accident.

## The call to make

Both directions are defensible and the decision belongs to whoever owns the bound's contract:

- **The bound covers the WIRE.** Then it is already right, and `JS-MAX-STRINGIFY` is measuring a
  value the wire never carries. The lane would stop generating binary views into the bounded
  presets, the way `BOUNDED_PRESETS` in
  [jsonSizeFuzzRunner.ts](../../packages/run-types/test/fuzz/type/jsonSizeFuzzRunner.ts) already
  sets `classes: false`, or the stringify oracle would measure the DataOnly projection instead of
  the raw value.
- **The bound covers ANY JSON body that could arrive.** Then a type containing a binary view is
  unbounded and loses its derived limit.

Worth weighing before choosing: mion turns this number into a per-route request size limit. Making
such a type unbounded drops it to the platform default (128 KB), which is LOOSER than the derived
limit it has today, so that direction costs real protection on exactly the routes that carry bulk
data.

## Done when

- The two oracles agree on a type carrying a typed array, an `ArrayBuffer`, a `SharedArrayBuffer`
  and a `DataView`, with a non-fuzz test pinning whichever answer is chosen.
- The chosen contract is written down on the `SubKindNonSerializable` arm, so the next reader does
  not have to re-derive it from the function-kind comment next to it.
- A soak of at least 7 minutes reports zero violations on both oracles.
