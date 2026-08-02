---
type: fix
spec: full-plan
status: open
created: 2026-07-30
---

# typia's `validationErrors` benchmark column is entirely broken: 195 errored cases

Found while running `pnpm rtx bench --website` for the JSON Schema lane ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)). **Not caused by that work** — the only change to `competitors/typia/cases.ts` there was ten `NOT_SUPPORTED` entries.

## Problem

Every `buildErrors` thunk in [container/benchmarks/competitors/typia/cases.ts](../../container/benchmarks/competitors/typia/cases.ts) calls `typia.createValidateFn()`. **That export does not exist** in the pinned version.

Evidence, read out of the shared image:

```
$ podman run --rm tsrt-website:dev sh -c "node -e \"…require('/bench/competitors/typia/node_modules/typia')…\""
13.0.0-dev.20260511
createAssert,createAssertGuard,createIs,createValidate,createAssertEquals,
createAssertGuardEquals,createEquals,createValidateEquals,createRandom
```

The function is `createValidate`. `createValidateFn` is a RunTypes name, not a typia one — it looks like it was pattern-matched from our own factory naming, or it is a typia 12 spelling dropped in 13.

Result, from `container/benchmarks/results/typia.json`:

```json
"summary": {"total": 276, "fail": 0, "errored": 195}
```

Per case, the `validate` metric is fine (it uses `typia.createIs`, which exists) while `validationErrors` errors with:

```
index.createValidateFn is not a function
```

`cases.ts` contains 195 occurrences of the bad name, which matches the errored count exactly.

## Why nobody noticed

- The error is a *runtime* failure inside a builder thunk, so the harness records `errored` per case and moves on. The lane produces a results file and looks like it ran.
- typia is the one competitor whose install is deliberately non-fatal in the Containerfile ("its column degrades gracefully"), so a blank typia column reads as normal.
- Nothing typechecks `container/benchmarks` ([benchmark-competitor-maps-never-typechecked.md](benchmark-competitor-maps-never-typechecked.md)) — `tsc` would have caught a nonexistent export on the typia namespace immediately. These two todos share a root cause.

The visible consequence is that the two `getvalidationerrors` benchmark pages have been shipping with no typia column at all, and the correctness page counts typia as uncovered for that metric.

## Fix plan

1. Rename the call to `typia.createValidate` across `competitors/typia/cases.ts` (195 sites, mechanical).
2. Check the return shape: `createValidate` returns `IValidation<T>` (`{success, data|errors}`), so the thunks' `(v) => val(v).success` reading is probably already right — verify against one case rather than assuming.
3. Re-run `pnpm rtx bench --one typia` and confirm `errored: 0`.
4. Expect the correctness lane to gain real typia divergence records for the error path once the column actually runs; those are results, not regressions.

## Done when

- `results/typia.json` reports `errored: 0`.
- The `getvalidationerrors` and `getvalidationerrors-formats` pages render a populated typia column.
- The name is pinned so a future typia bump that renames it fails loudly (the typecheck gate in the sibling todo is the natural mechanism).
