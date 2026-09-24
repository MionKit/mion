---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# Remove the validate options `noLiterals` and `noIsArrayCheck`

## Intent

Two `ValidateOptions` have no user left:

- `noLiterals` loosens a literal to its base type (`'a'` becomes any string). It was added for the old tuple-based headers type, which never ended up using it. Nothing in router, core or client has ever passed it.
- `noIsArrayCheck` skips the `Array.isArray` guard. It was added so the router could skip the check on a headers array the router built itself. Headers moved to `HeadersSubset`, so that use is gone. Today it only covers array types (not tuples, so not route params), the router cannot turn it on, and on untrusted input it is unsafe: for `string[]`, `42`, `true`, `{}` and `"abc"` pass, and `null` throws.

Their only callers are the validation benchmarks and examples. Removing both also shrinks each validator family's variant table (the `L` and `A` letters go).

Breaking change, fine with no users yet. No alias.

## Direction

The implementer plans the details. Verified pointers:

- Option registry: `ts-go-runtypes/internal/constants/constants.go` `ValidateOptions` (~250). Keep the `numberMode` entries (`T`, `M`) and the circular `C` fork; keep the variant-suffix format working for what remains.
- Emitters: `cachegen/typefunctions/validate.go` (the `noLiterals` arm in `KindLiteral` ~473 and `emitLiteralBaseKind` if nothing else uses it; the `noIsArrayCheck` arm in `KindArray` ~485-503) and `validationerrors.go` (~416-516).
- Scanner and diagnostics: `internal/compiler/resolver/scan.go:~726-731` and the `CodeValidateOptionsNoLiteralsNoop` / `CodeValidateOptionsNoArrayNoop` diagnostics (`internal/diagnostics/codes_marker.go`, `messages.go`). Remove the code and its catalog entry, and check the catalog / code-number rules in `ts-go-runtypes/CLAUDE.md` before deleting a code.
- TS surface: the two fields on `ValidateOptions` in `packages/run-types/src/createRTFunctions.ts`.
- Regenerate with `pnpm miondevx core codegen` (run-types `fnHashes.generated.ts`, core `jitFunctionIds.generated.ts`, devtools `diagnosticCatalog.generated.ts`).
- Tests: about 34 files under `packages/run-types/test` and `ts-go-runtypes` mention either option; drop the cases that only exist for them.
- Benchmarks: the `*_noLiterals` and `string_array_noIsArrayCheck` cases in `container/benchmarks/shared/cases/validation/Atomic.ts` / `Array.ts` and every competitor's `cases.ts` (mion, `schemaCases.ts`, ajv, typebox, typia, zod), `container/benchmarks/typecost/typecost.mjs`, and the note in `container/benchmarks/README.md:~264`.

## Docs

`container/website/content/02.runtypes/02.guide/03.validation.md`: the existing section on validate options, drop both options. Examples: `packages/examples/src/guide/validation-options.ts`, `markers-comptime.ts`, `markers-fn-hash.ts`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- No `noLiterals` / `noIsArrayCheck` (or their `L` / `A` variant letters) remain in source, generated tables, tests, benchmarks, examples or docs.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run typecheck` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
