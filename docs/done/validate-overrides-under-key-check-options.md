---
type: fix
spec: guidelines
status: done
created: 2026-09-29
---

# overrideValidate may be skipped when checkUnknowns or checkUnionUnknowns is set

## Intent

`createValidateFn` and `createGetValidationErrorsFn` take two options that also fail on undeclared keys:

    createValidateFn<User>(undefined, {checkUnknowns: true});      // fails on any undeclared key
    createValidateFn<Pet>(undefined, {checkUnionUnknowns: true});  // same, on union members only

Each option routes the call to its own family (`validateStrict`, `validateUnionKeys`, and the
`validationErrorsStrict` / `validationErrorsUnionKeys` twins). A user override registered with
`overrideValidate<T>()` or `overrideGetValidationErrors<T>()` is stored on the type under the operation name
`validate` / `validationErrors`, but the render looks the override up under the family's own operation name. So
with either option on, the custom function is probably never used, and nothing says so. The registry comment
for these families (`ts-go-runtypes/internal/cachegen/operations/operations.go`, the fused validators block)
says a family "honours overrides".

Found by reading, then reproduced: the plain call ran the override, the two options did not.

## Direction

The implementer plans the details. Pointers:

- `overrideOpKeyForTag` in `ts-go-runtypes/internal/cachegen/typefunctions/override.go` maps a family tag to the
  key it reads from `RunType.Overrides`. `overrideBaseOperation` there already sends the two removeUnknownKeys
  `sharedValues` families back to `removeUnknownKeys`; the four validator families may need the same, or the
  decision is that a key-checking validator must not run a user override (then say so and warn).
- The override is recorded by `detectOverrideSite` in `ts-go-runtypes/internal/compiler/resolver/overrides.go`
  under `op.Name`; `overrides_test.go` pins `Overrides["validate"]`.
- Tests: an override that returns a fixed answer, called through plain, `checkUnknowns` and `checkUnionUnknowns`,
  for both validate and validationErrors, in `packages/run-types/test/suites/overrides/`, both call shapes.

## Docs

The overrides section of the runtypes guide, if the behaviour with these options changes or is a documented limit.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A test shows what an override does under each option, and that behaviour is the intended one.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Plan — run the override under both options (approved 2026-09-29)

Decision: a key-checking validator runs the user's plain override, the same way the two `sharedValues`
removeUnknownKeys families already did. The override owns the whole check for its type, so the unknown-key check
skips that type; a parent object or union still checks its own keys.

What shipped:

- `overrideBaseOperation` in `override.go` maps `validateStrict` / `validateUnionKeys` to `validate` and
  `validationErrorsStrict` / `validationErrorsUnionKeys` to `validationErrors`. That one map serves both the root
  redirect and a nested child, since the walker reads the same op key.
- The registry comment in `operations.go` now says which override the fused families run.
- Go: `override_test.go` pins the op key of every option family.
- JS: `KeyCheckOptions.ts` in the overrides suite runs fixed-answer overrides for validate and validationErrors through
  plain, `checkUnknowns` and `checkUnionUnknowns`, both call shapes, at the root, nested in an object (the parent
  still rejects its own extra key) and nested in a union member (the union still rejects a key only the other member
  declares). A union's errors form only reports one `union` error when no member matches, so the override shows
  there through which member matches.
- Docs: none. The guide already says every matching `createX` call returns the override, so this fix makes the code match it.
