---
type: fix
spec: guidelines
status: done
created: 2026-10-31
---

# Strict unknown-key checks: validate and errors disagree, errors throws at 10 keys

## Intent

Found by the benchmark fairness review (generated code for the `STRICT.*` bench cases). Two bugs in the
`checkUnknowns` (strict object) path of `@mionjs/run-types`:

1. **Validate and the error list disagree on arrays.** The errors function wraps every unknown-key check in
   `if (!Array.isArray(node))`, while the validate function counts enumerable keys (`cntEK(v) === N`) with no
   such skip, so it counts array indices. An array that carries the N required props plus index entries is
   rejected by `createValidateFn` and accepted by `createGetValidationErrorsFn`. The two must always agree.
2. **The error list throws instead of reporting** once a node has 10 unknown keys (`_getUnknownKeysFromArray`,
   `MAX_UNKNOWN_KEYS = 10`). A validation-errors function must return errors, never throw on bad input.

No shared bench sample hits either one today.

## Direction

- Repro: a strict `{id: number; name: string; active: boolean}` with `checkUnknowns`; feed an array with those
  three props set, and an object with 10+ extra keys. Compare validate vs errors.
- Fix in the strict-object emit (Go resolver) and the pure fn behind `_getUnknownKeysFromArray`. Decide which
  array behavior is right (match the non-strict object check) and make both functions do the same.
- Tests: both `getRunTypeId` call shapes per the Marker test coverage rule; a validate/errors agreement test.
- The implementer plans the details.

## Docs

None, because the documented behavior (strict objects reject unknown keys and report them) does not change; this
makes the code match it.

## Done when

- Validate and errors agree on arrays for strict objects; the errors fn reports every unknown key without throwing.
- Tests pin both, both call shapes.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan: fix both bugs (approved 2026-11-01, automatic mode, delegated session)

- Array behavior: an array is an object to the non-strict check (it passes when it carries the props), so the
  strict check judges its enumerable keys like any object's. Index keys count as unknown. Validate already does
  this; the errors fn drops its `!Array.isArray(v)` skip around the key scan
  (`emitObjectValidationErrors`, `ts-go-runtypes/internal/cachegen/typefunctions/validationerrors.go`).
- `getUnknownKeysFromArray` (`packages/run-types/src/runtypes/pure-fns-utils.ts`) loses `MAX_UNKNOWN_KEYS` and
  its throw: it returns every unknown key.
- Go tests (`internal/compiler/resolver/check_unknowns_test.go`): the error family emits no array test, both
  call shapes.
- Vitest (`packages/run-types/test/features/unknownKeys.test.ts`): validate and errors agree on arrays (count
  fast path and key-scan path), 12 unknown keys all reported without a throw, both call shapes.
- No docs: documented behavior unchanged. Not a fuzz candidate: a fix, not a feature.

## What shipped

- As planned. `guardStatement` (only caller was the dropped skip) is gone; the helper's body hash changed, so
  `pnpm miondevx core codegen builtinpurefns` regenerated both id files.
- The old skip had a reason: an array that FAILS its property checks got no index-key noise. That is dropped on
  purpose: the error list is now complete, so `[1, 2, 3]` against a strict object reports its type errors plus
  `'0'`, `'1'`, `'2'`. The test oracle `undeclaredKeyErrors` (`test/suites/strict-validation/Strict.ts`) counts an
  array's keys the same way, and the parity corpus in `checkUnknowns.test.ts` gained two arrays carrying the props.
- Review found one more array disagreement: a strict type declaring `length` took the key count, which misses an
  array's non-enumerable `length`. `countFastPathN` now refuses the count for a declared `length`, pinned in Go
  and Vitest, both call shapes.
- The same count also misses a declared prop that is a getter or otherwise not enumerable (not array-specific).
  Fixing it trades away the strict fast path, so it is filed as its own todo in this PR.
