---
type: fix
spec: guidelines
status: ready
created: 2026-10-20
---

# elision soak: validate rejects a conforming `0` (E3-behavior)

## Evidence

Release PR #507 (`release/v0.13.1`, commit `af84c337a`), lane `gate / fuzz soak · elision`:

```
[elision-fuzz] seed 0x2f70c658 from MION_FUZZ_SEED
Error: 1 oracle violation(s) + 0 crash(es) over 309 generated schemas (3 re-rolls):
  [E3-behavior] [1d] E0 (seed=3805772828):
      validate rejected a conforming value: 0
```

Reproduces locally on main `af84c337a` with the same seed (243 schemas in the local 60s soak, same finding).

## Repro

```bash
MION_FUZZ_SEED=0x2f70c658 pnpm miondevx core fuzz elision --soak
```

Never re-roll the seed. The iteration seed `3805772828` should rebuild the single schema
faster if the lane supports a per-iteration replay.

## Intent

E3 says the two schema spellings behave the same, and a value the schema accepts must pass
`validate`. Find which side is wrong (the generated validator for this schema, the elided
spelling, or the oracle's idea of a conforming value) and fix the real cause, with a
regression test for the shrunk schema.

## Plan: shared id fix (approved 2026-10-20, automatic mode)

Shrunk schema: `enum E0 {M0}`, which `mion convert --to builders` prints as `RT.literal(0)`.
Neither spelling was wrong on its own. The real cause is in the Go type id: a literal's id text was its
bare value, so `'0'` and `0` (and `'true'` / `true`, `'1n'` / `1n`) got the same id. The soak compiles
many schemas through one resolver, so an earlier `'0'` schema left `v === '0'` in the shared cache and
the `0` schema reused it.

- Fix: `literalString` in `ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go` quotes string
  literals, so their id text never matches a number, boolean or bigint literal.
- Tests: Go `TestStructural_StringLiteralNotDeduplicatedWithSameText` + its `_ValueFirst` pair
  (`structural_test.go`), JS `packages/run-types/test/features/sameTextLiterals.test.ts` with the
  shrunk enum / builder case next to a compiled `'0'`. All fail on the old binary.
- Docs: none, no documented behavior changes (ids are internal; a stale on-disk cache just recompiles).
- Fuzzing: existing elision lane; seed `0x2f70c658` passes after the fix.
