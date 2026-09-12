---
type: fix
spec: guidelines
status: ready
created: 2026-09-12
---

# jsonMaxBytes underestimates a bounded Set of a union

## Intent

`jsonMaxBytes` is supposed to be a true upper bound on what the compiled JSON encoder emits for a
type. For at least one shape it is not, so a consumer deriving a request size limit from it can
reject a payload the encoder itself produced. Make the bound hold for that shape, and keep the
fuzz lane that found it green.

## What fails

The `jsonsize` fuzz lane's soak reported three violations on CI run
34719842695 (job 103623691959):

```
[jsonsize-fuzz][JS-MAX-ENCODER] [1d] Set<({2}|{3}|{3}|{1})>≤1 (seed=2646330014):
the compiled JSON encoder emits 70 bytes, over the type's jsonMaxBytes 68
    [[-1,{"kind":"t2","f0":[2,null],"f1":[1,"1995-03-12T13:06:34.149Z"]}]]
```

All three are the same type and the same per-type seed, differing only in the Date the mock drew,
so it is one defect seen three times rather than three.

The oracle is `JS-MAX-ENCODER` (see `measure()` in
[jsonSizeFuzzRunner.ts](../../packages/run-types/test/fuzz/type/jsonSizeFuzzRunner.ts)): the
bound read off the reflection root against the encoder's real UTF-8 output. The lane also checks
`JSON.stringify`, which did not trip, so the gap is between the bound and the ENCODER's wire
form, not the raw value's.

## How to reproduce it

The soak is time-boxed (`MION_FUZZ_JSONSIZE_SOAK_MS`), so the lane's own seed does NOT replay on
a different machine: it explores however many types fit the budget, and a faster or slower box
walks a different set. `MION_FUZZ_SEED=0xe07d86b5 pnpm miondevx core fuzz jsonsize --quick`
passes on a dev box for exactly that reason. Do not read that pass as the bug being gone.

Use the PER-TYPE seed instead. `runJsonSizeFuzz({seed, iterations})` is seeded per iteration and
the violation carries the iteration's seed, so start from `2646330014` and work down to the one
type. Failing that, hand-write the shape the report names: a `Set` with `maxSize` 1 whose member
is a union of four object arms (2, 3, 3 and 1 properties), one arm carrying a Date.

## What to look at

The encoder's wire form for a `Set` is an array, and for a union it is a `[armIndex, value]`
tuple: the sample value shows both (`[[-1, {...}]]`, the `-1` being the Set's own arm marker).
So the suspects are the per-member tuple overhead a union arm costs and the Set's own framing,
one of which the bound walk is not charging for. The encoder is the truth here and the bound is
the thing to correct: raising the computed bound to match what the encoder emits is the fix,
never loosening the oracle.

Check whether the same undercount reaches `Map`, and whether it is specific to a union inside a
sized container or shows up for any union member, since that decides how wide the fix is.

## Out of scope

The lane's own shape. It did its job: it found a real undercount and printed a replayable seed.
Making the soak's exploration deterministic across machines is a separate concern and must not
be traded for this fix.

## Done when

- The bound holds for the reported shape, with a non-fuzz test pinning it (a bounded `Set` of a
  union whose computed `jsonMaxBytes` is at least what the encoder emits).
- `pnpm miondevx core fuzz jsonsize` and its soak pass.
- The same shape is checked for `Map`, and either fixed with it or shown to be unaffected.
