---
type: fix
spec: guidelines
status: done
created: 2026-10-19
---

# nondata soak: clone and compact wires disagree on the decoded value (oracle O12)

## Evidence

Release gate run 39249346902 on `main` @ `f95566c2d`, job `fuzz-soak-nondata / fuzz soak · nondata`
(10-minute soak, `.github/workflows/fuzz-nondata-soak.yml`).
Replay: `MION_FUZZ_SEED=39249346902 pnpm miondevx core fuzz nondata --soak` (lane seed `0x23718156`).

```
[nondata-fuzz][O12/valid] ({4}|{2}|{4})[] (seed=3065189181): clone and compact wires disagree on the decoded value:
  json        =[[-1,{"kind":"t2","f0":[2,{"m1_2":"https://example.com/","m0_0":true}],"f1":{"p0":false},"f2":[[…
  via-compact =[[-1,{"kind":"t2","f0":[2,{"m1_2":"https://example.com/","m0_0":true}],"f1":{"p0":false},"f2":[[…
  [{"kind":"t2","f0":{"m0_0":true,"m1_1":"Symbol(…)","m1_2":"https://example.com/"},…},{"kind":"t0","f0":{"p0":{},"p1":"Symbol(…)"},…}]
soak finished: 3778 types, 1 violation(s)
```
(test/fuzz/type/nonDataTypeFuzz.integration.test.ts:76)

## Intent

O12: decoding the clone wire and the compact wire must give the same value. The type is an array of a
discriminated union of three object members. The finding turned out to be a false positive of the oracle:
it copied the value with `deepCloneForRoundTrip` before `compactEncode`, which flattened member t0's
`f1: DataView` to `{}`, and member t2's `f1` object codec then kept it on the compact wire. Fix the copy,
keep both wires agreeing.

## Done when

- The failing seed replays green with the command above.
- A regression test pins the shape.

## Plan: test-helper copy fix (approved 2026-10-19, automatic mode)

Root cause is in the oracle, not a codec. `checkCrossWire` copies the value with `deepCloneForRoundTrip` before
`compactEncode`. That helper had no case for binary natives, so a `DataView` became a plain `{}`. In the failing type,
member `t0` has `f1: DataView` and member `t2` has `f1: {p0?: false}`, so the `{}` matched `t2`'s object codec and
the compact wire kept `f1: {}`, while the clone wire (fed the real `DataView`) dropped it. A real `DataView` gives
the same value on both wires.

- Fix `deepCloneForRoundTrip` (`packages/run-types/test/util/equalsHelpers.ts`): copy `ArrayBuffer`,
  `SharedArrayBuffer`, typed arrays and `DataView` as their own kind; pass Promises through as its doc already claims.
- Tests: O12 unit test over every binary kind + Promise (same bytes, offset, own memory); a shape test in
  `unionStrippedSibling.smoke.test.ts` (real `DataView` through `checkCrossWire`); seed 3065189181 added to
  `diagnosticTruth.smoke.test.ts`'s pinned seeds.
- No docs: test-only change. Not a new fuzz candidate: the existing lane already covers it.
