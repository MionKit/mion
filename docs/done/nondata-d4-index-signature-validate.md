---
type: fix
spec: guidelines
status: ready
created: 2026-10-19
---

# nondata soak: `validate<DataOnly<T>>` rejects a mock `validate<T>` accepts

## Evidence

Release gate run 39293992108 (main `8956770cd`), lane `fuzz soak · nondata`, oracle D4:

```
[nondata-fuzz] seed 0x261abcac from MION_FUZZ_SEED
[nondata-fuzz][D4/valid] {3+idx} (seed=982099663): validate<T> says true but validate<DataOnly<T>> says false on the mock
    {"0":"la","1":"lb","2":"lb","3":"la","4":"lb","5":"lb","6":"la","7":"lb","8":"la","9":"la","10":"lb","11":"lb","12":"la","13":"lb","14":"la","p0":{},"p2":{}}
soak finished: 4601 types, 1 violation(s), 0 invalid-TS false positive(s) filtered
```

`{3+idx}` = an object with three named props plus an index signature. The mock carries
numeric-looking keys with literal string values next to `p0` and `p2` (`p1` absent, so likely optional).

## Repro

```bash
MION_FUZZ_SEED=0x261abcac pnpm miondevx core fuzz nondata --soak
```

Never re-roll the seed. The iteration seed `982099663` should rebuild the single failing type
faster if the lane supports a per-iteration replay; otherwise run the soak and read the log.

## Intent

D4 holds: a value `validate<T>` accepts must also pass `validate<DataOnly<T>>` when `T` is
already data-only on that value. Find which side is wrong (the `DataOnly` mapping of an
index signature next to named props, the validator for it, or the fuzz oracle's
expectation) and fix the real cause, with a regression test for the shrunk type.

## Plan: fix the oracle (approved 2026-10-19, automatic mode)

Shrunk type: `{p2?: RegExp; [k: number]: "la" | "lb"}` (also any other member `DataOnly` drops, like `ArrayBuffer`).

- **Validators are right.** An index signature claims every undeclared key, as documented ("a member with an
  index signature declares every property"), so `validate<{[k: number]: "la"}>({p2: /a/})` is `false` on purpose.
  `validate<T>` skips `p2` only because `T` declares it. `DataOnly<T>` drops `p2`, so the raw mock's `p2` is an
  undeclared key there and fails the index value check.
- **The oracle was wrong.** It fed `validate<DataOnly<T>>` the raw mock, which still carries the dropped non-data
  members. `DataOnly<T>` is the shape the serializer produces, so the oracle now compares against the sample with
  the members `DataOnly<T>` drops removed (`dataOnlyView` in `dataOnlyOracle.ts`), walking kept members, index
  values, arrays and tuples. Unions, Maps and Sets keep their values as drawn (members cannot be paired).
- **Tests:** seed `982099663` pinned in `diagnosticTruth.smoke.test.ts`, plus a shrunk-type test there proving the
  serializer output of a value with `p2` passes `validate<DataOnly<T>>` while the raw value does not; a
  `dataOnlyView` unit test in `dataOnlyOracle.unit.test.ts`.
- **Docs:** none, no user-visible behavior changed. **Fuzzing:** this is a fuzz oracle fix, no new lane.
