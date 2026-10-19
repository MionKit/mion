---
type: fix
spec: guidelines
status: done
created: 2026-10-19
---

# apiids soak: an optional member against a same-typed index signature fails the server compile

## Evidence

Release gate run 39249346902 on `main` @ `f95566c2d`, lane `fuzz soak · apiids`.
Replay: `MION_FUZZ_SEED=39249346902 pnpm miondevx core fuzz apiids --soak`.

```
iteration 16 (seed 594641238, {3+idx}): server compile exited 1
error TS2411 (1)
  Property 'p0' of type 'false | undefined' is not assignable to 'string' index type 'false'.
    src/types.ts:1:30
--- types.ts ---
export type Root = {readonly p0?: false; p1: false; p2: false; [k: string | symbol]: false};
```

## Intent

TS2411 is a real TypeScript error for this source under `exactOptionalPropertyTypes: false`: an optional
member's type includes `undefined`, which the index signature does not allow. So either the generator emits
types TypeScript itself rejects (oracle side: the generator must not draw an optional member whose type does
not fit a same-key-type index signature), or the fixture compiles with settings that should accept it.
Find which, fix the root cause, and keep the generator drawing the shape it means to test.

## Done when

- The failing seed replays green with the command above.
- A regression test pins the exact shape.

## Plan: generator fix + apiids gate (approved 2026-10-19, automatic mode)

Root cause is the oracle side: the fixture compiles with `strict: true`, and TS2411 is correct there. The
generator forced every named member under a `string` index to the index value shape but still let it be
optional, which adds `undefined`. Built:

- `core/typeGen.ts` `genMembers`: a forced member is optional only when the index value type admits
  `undefined` (`admitsUndefined`: `undefined`, `any`, `unknown`, `void`, or a union holding one), so valid
  shapes like `{p0?: unknown; [k: string]: unknown}` are still drawn. The `chance` draw still happens first,
  so every other seed keeps its stream; the failing seed now draws `{readonly p0: false; ...}`.
- `apiids/apiIdsFuzz.ts`: the lane had no TS-validity gate though the generator's contract says residual
  invalid combos (numeric weird keys under a number index) are dropped by one. `recordIterationFailure`
  now mirrors `typeFuzzRunner`: a failure on an invalid generated type is counted in `skippedInvalidTypes`
  instead of reported; the integration test caps that count at `SUPPRESSION_CEILING`.
- Tests: `typeGen.unit.test.ts` (no optional member under a string index unless the index admits
  `undefined`, over 4000 draws, and the valid case is still drawn), `apiids/apiIdsGate.test.ts` (the gate
  counts an invalid type, reports a valid one, and the exact seed replay with the lane's options),
  `tsValidateGate.test.ts` (TypeScript rejects the reported shape).
- Replay `MION_FUZZ_SEED=39249346902 pnpm miondevx core fuzz apiids --soak`: 40 iterations, 3 tests passed.
