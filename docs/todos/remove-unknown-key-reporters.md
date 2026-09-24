---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# Remove `createHasUnknownKeysFn` and `createUnknownKeyErrorsFn`

## Intent

Undeclared keys now have two clear owners:

- **Checking** belongs to validation: `createValidateFn<T>({checkUnknowns: true})` and `createGetValidationErrorsFn<T>({checkUnknowns: true})` reject or report undeclared keys in the same pass as the type check.
- **Removing** belongs to `createRemoveUnknownKeysFn<T>()`, which returns a sanitised copy of any value.

`createHasUnknownKeysFn` (family `hasUnknownKeys`, with its `runsAfterValidation` / `OV` variant) and `createUnknownKeyErrorsFn` (family `unknownKeyErrors`) are validation-only questions answered a second way. Nothing in mion uses them. Remove both public factories, their override functions and their fnHash rows.

Breaking change, fine with no users yet. No alias.

## Direction

The implementer plans the details. Verified pointers:

- TS surface: the two factories and their types in `packages/run-types/src/createRTFunctions.ts` (plus `HasUnknownKeysOptions` / `HasUnknownKeysCompileOptions`), exports in `src/index.ts`, `overrideHasUnknownKeys` / `overrideUnknownKeyErrors` in `src/overrideRTFunctions.ts`, the `hasUnknownKeysOptions` axis in `src/fnHash.ts`, and anything in `src/runtypes/pure-fns-utils.ts` only they use.
- Go: the operations and the `AxisHasUnknownKeysOptions` / `HasUnknownKeysOptions` table (`internal/cachegen/operations/operations.go`, `fnhash.go`, `demand.go`; `internal/constants/constants.go`; `cmd/gen-fn-hashes/gen.go`; `cmd/gen-fn-catalog/main.go`; resolver `scan.go` / `dispatch.go`).
- CAREFUL: the strict validators reuse the unknown-keys emitters. `validate_strict.go` builds on the `hasUnknownKeys` walk (including the runs-after-validation fast path) and `validationErrorsStrict` reaches `unknownkeys_errors.go`; `unknownkeys_shared.go` is shared. Keep every emitter the strict validators need, remove only what becomes unreachable, and rename internal pieces only if the old name would now mislead. `checkUnknowns` behaviour and speed must not change: compare the strict-validation benchmark cases before and after.
- Tests that use the two factories as ORACLES must switch to `checkUnknowns` validators or an in-test reference, not be deleted: `test/fuzz/cloning/cloneFuzz.integration.test.ts`, `test/fuzz/value/fuzzOracle.ts` / `fuzz.integration.test.ts` / `unknownKeyPositions.ts`, `test/features/unknownKeyFamiliesAgree.test.ts`, `unionUnknownKeys.test.ts`, `recordUnionUnknownKeys.test.ts`, `unionDecodeAgree.test.ts`. Drop tests that only exist for the removed factories (`unknownKeys.test.ts` parts, `suites/overrides/ObjectFns.ts` cases, Go `unknownkeys_has_variant_test.go` if nothing else it pins survives).
- Regenerate with `pnpm miondevx core codegen` (run-types `fnHashes.generated.ts`, core `jitFunctionIds.generated.ts`, devtools tables, website `functions-catalog.json`).
- Other callers: `container/pre-publish-e2e/apps/shared/src/unknown-keys.ts`; benchmarks `container/benchmarks/competitors/mion/cases.ts`, `schemaCases.ts`, `engineBranch.ts`, `container/benchmarks/shared/cases/strict/index.ts` (keep the strict lanes on `checkUnknowns`).

## Docs

`container/website/content/02.runtypes/02.guide/03.validation.md`: the existing unknown-keys section. Keep `checkUnknowns` and `createRemoveUnknownKeysFn`, drop the two factories, and say in one line which to use for checking vs removing. Examples: delete `packages/examples/src/guide/unknown-keys-has.ts`, `unknown-keys-errors.ts`, `unknown-keys-after-validation.ts` (or rewrite one onto `checkUnknowns` if the page needs it), and update `all-factories.ts`. Check the compiled functions reference table.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- `createHasUnknownKeysFn`, `createUnknownKeyErrorsFn`, `overrideHasUnknownKeys`, `overrideUnknownKeyErrors`, the `hasUnknownKeys` / `unknownKeyErrors` fnHash rows and the `hasUnknownKeysOptions` axis are gone from source, generated tables, tests, benchmarks, examples and docs.
- `checkUnknowns` validators behave and perform as before; the fuzz oracles still run.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run typecheck` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
