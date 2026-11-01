---
type: fix
spec: guidelines
status: ready
created: 2026-10-31
---

# Temporal bounds are re-parsed on every validator call

## Intent

Found by the benchmark fairness review (mion reference sheet for the DATETIME cases). Generated validators for
bounded Temporal types re-run `Temporal.X.from("<literal>")` for every bound on every call, e.g.
`Temporal.Instant.compare(v, Temporal.Instant.from("2020-01-01T00:00:00Z")) > 0`, emitted by `temporalBoundExpr`
(`ts-go-runtypes/internal/cachegen/typefunctions/formats/datetime/temporalFormat.go:96-99`). That is avoidable work on the hot path: the literal never changes.

- 18 bench cases hit it (instant, plainDate, plainTime, plainDateTime, plainYearMonth, zonedDateTime min/max/gt/lt).
- The relative Temporal bounds also re-parse `Temporal.Duration.from("P…")` per call (`temporalFormat.go:109`),
  and the relative native-Date bounds re-run a regex duration parse per call (`dateTime-pure-fns.ts:441`).
- Native Date absolute bounds are already folded to constants, so only these paths lag.

Also seen in the same review, same emitter family: the generated validate for a tuple with a rest element
(`call_signature_params_with_rest`) ends with unreachable `return true; return v\nreturn true` leftovers.

## Direction

- Hoist each parsed literal bound and each parsed duration to the validator's closure / context scope, built once.
- "now" must stay per call (a relative bound reads the clock on every call).
- Remove the dead emit after the rest-tuple loop.
- Tests: generated-code tests for a bounded Temporal type (both `getRunTypeId` call shapes), a relative bound
  still moving with the clock. The implementer plans the details.

## Docs

None, because behavior does not change; only per-call cost.

## Done when

- No `Temporal.*.from(...)` or duration parse of a literal runs per call; relative bounds still read "now" per call.
- Tests pin it, both call shapes.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan: hoist bounds + drop dead tuple return (approved 2026-11-01, automatic mode, delegated session)

- `formats.HoistConst` (moved out of `structural/objectformat.go`, now shared) puts each parsed bound in the
  validator factory's prologue.
- Temporal (`temporalFormat.go`): `Temporal.X.from('lit')` → hoisted `tBoundN`; a relative bound hoists only its
  `Temporal.Duration.from('P…')` as `tDurN`, the body keeps `Temporal.Now.X().add|subtract(tDurN)`.
- Date / time / dateTime strings + native Date (`boundcodegen.go`): the `relativeNowKey(spec, scale)` pure fn now
  parses the spec once and returns a clock-reading fn. The prologue holds `const rNowN = relativeNowKey(...)`, the
  body calls `rNowN()`. Pure-fn id regenerated (`pnpm miondevx core codegen all`).
- Rest tuple: the walker's block-in-block case appended a dead `return v` after a child block that already
  returns, which also stopped the tuple from stripping the rest loop's `return true`. It now passes the child
  block through unchanged (`walker.go`, `handleCodeInterpolation`).
- Tests: Go `resolver/bound_hoist_test.go` (Temporal + native Date + rest tuple, both call shapes), updated
  `temporal_format_test.go`; JS clock-movement tests in `formatRelativeBounds.test.ts` and
  `temporalFormat.test.ts` (one validator instance, answer flips as time passes).
- No docs: behavior unchanged.
