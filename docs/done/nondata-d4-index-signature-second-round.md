---
type: fix
spec: guidelines
status: done
created: 2026-10-20
---

# nondata soak: D4 still fails on objects with an index signature

## Evidence

Release PR #507 (`release/v0.13.1`, commit `0c2212ce9`), lane `gate / fuzz soak · nondata`:

```
[nondata-fuzz] seed 0x31b22443 from MION_FUZZ_SEED
[D4/valid] {4+idx} (seed=4151093482): validate<T> says true but validate<DataOnly<T>> says false on the mock,
  which DataOnly<T> saw as {"0":";","1":"aNBgT*=3<k{e#Pl0E&4aK%,k  OIaVsm;…","2":"fy0..n~2QK,…", …}
[D4/valid] {2+idx} (seed=2456381542): validate<T> says true but validate<DataOnly<T>> says false on the mock,
  which DataOnly<T> saw as {"0":null,"1":null,"2":null, … "50":null …}
soak finished: 3524 types, 2 violation(s)
```

Both types are objects with named props plus an index signature (`{N+idx}`). The printed value shows only
numeric keys, but the snapshot hid the function-valued key and cut off the rest: the view still carried
the function member. Either `dataOnlyView` (the oracle's model of
what the serializer keeps, `packages/run-types/test/fuzz/type/dataOnlyOracle.ts`) or the generated
`validate<DataOnly<T>>` is wrong. An earlier round fixed the same oracle for a number index next to a
dropped prop (`docs/done/nondata-d4-index-signature-validate.md`); these two are new shapes.

## Repro

```bash
pnpm run check:builds   # rebuild the resolver first: a stale binary gives false results
MION_FUZZ_SEED=0x31b22443 pnpm miondevx core fuzz nondata --soak
```

Never re-roll the seed. Iteration seeds `4151093482` and `2456381542` should rebuild the two types
faster if the lane supports a per-iteration replay. Print each type's source to see the shapes.

## Intent

D4 holds: a value `validate<T>` accepts, once reduced to what `DataOnly<T>` keeps, passes
`validate<DataOnly<T>>`. Decide per finding whether the validator, `DataOnly`, or the oracle is wrong
(the docs and validation suites define intended behavior, e.g. a number index checks every key),
fix the real cause, and pin both iteration seeds as regression tests.

## Plan: fix the oracle again (approved 2026-10-20, automatic mode)

Shrunk types: `{p1: () => symbol; p2: bigint; [k: number | symbol]: string}` (4151093482) and
`{p0: () => Date; [k: number]: null}` (2456381542).

- **Validators and `DataOnly` are right.** A function-typed property reflects as a method signature. `validate<T>`
  skips it as a declared key, `DataOnly<T>` drops it, and the serializer omits it, so the JSON round trip of the
  mock passes `validate<DataOnly<T>>`.
- **The oracle was wrong.** `dataOnlyView` removed dropped members only among properties, so a method member stayed
  in the view and faced the number index signature as an undeclared key. It now removes the methods T declares
  that `DataOnly<T>` does not keep.
- **Tests:** both seeds pinned in `diagnosticTruth.smoke.test.ts`, plus a shrunk-type test there (serializer
  output passes, raw value does not); a `dataOnlyView` unit test with a method member next to an index signature.
- **Docs:** none, no shipped behavior changed. **Fuzzing:** oracle fix, no new lane.

### Added during the build: Map and Set values

Soaks on seeds `0x5eed0a17` and `0x7c3d9e21` hit the same D4 report one level down:
`Map<string, {p0: () => [string]; p1: Map<number, "la" | "lb">; p2: (a0: "la" | "lb") => bigint; [k: number]: boolean}>`
(339162220) and `Map<string, N1>` with a method and dropped members under N1's index signature (16959456).
`dataOnlyView` left Map and Set contents as drawn. It now walks Map keys and values and Set items through their
`arguments` types. Both seeds pinned, plus a Map case in the shrunk-type test and a Map/Set unit test.
The review also made the view strip every method, made the members check flag a method `DataOnly<T>` keeps, and made
report snapshots print function values (`JSON.stringify` hid the key behind this finding).
