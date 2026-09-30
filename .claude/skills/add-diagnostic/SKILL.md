---
name: add-diagnostic
description: Checklist for adding or changing a build diagnostic or a type-function emit arm in the Go resolver, so it reaches every nested position and the right call site. Use before touching diagnostics/, cachegen/typefunctions/ or a code's prose.
---

# add-diagnostic

Every bug this checklist guards against built clean and failed later: a function that threw at runtime with no build
error, a member dropped with no note, a note on a call site whose function never runs that code. Each one came from a
rule written for the root of a type, or for one emit path, and never tried one level deeper.

Work through it in order. Each step names the check that fails when you skip it; if you add a rule no check covers,
add the check.

## 1. Pick Scope and Level

- **Scope** (`internal/diagnostics/catalog.go`): `ScopeRoot` only when the SAME trigger one level deeper is a different
  code (a root code vs its child-position drop). Anything else is `ScopeGraph`. `register` panics without one.
- **Level**: ask the two questions in [ts-go-runtypes/CLAUDE.md](../../../ts-go-runtypes/CLAUDE.md) (is code produced?
  is it broken when it runs?). A function that always throws is `LevelRuntimeError`, never a warning.
- A new prefix needs a subsystem row in `scripts/core/gen-diagnostics-catalog.mjs`, then
  `pnpm miondevx core codegen all`.

## 2. Write the prose with both examples

`internal/diagnostics/prose.go`: `Summary`, `Fix`, `Example`, and for `ScopeGraph` a `NestedExample` (the same trigger
one object deeper). `TestDiagExamples_TriggerTheirCode` and `TestDiagExamples_TriggerAtDepth` feed both through a real
scan.

## 3. Decide "is it data?" in one place

- What counts as data is `reflection.NonDataOf` (`internal/reflection/nondata.go`), the Go mirror of `DataOnly<T>`.
  Never test kinds by hand (`Kind == KindFunction`, a symbol flag, a call-signature scan) in an emitter or a shortcut:
  call `isStrippedUnionMember` / `isCallableValue` / `nonDataOf`.
- A new non-data shape goes into `NonDataOf` AND `dataOnly.ts`, together.
- `TestNonDataAgreement_*` (`cachegen/typefunctions/nondata_agreement_test.go`) fails when a kind has no row or a
  family's root disagrees with `NonDataOf`.

## 4. Emit through the walker, and only there

- Report with `ctx.EmitDiagnosticSlot` / `walker.EmitDiagnostic`. A walk reports at the sites that NAMED its type;
  `ReportReachedFindings` (`cachegen/typefunctions/module.go`) carries the finding to every site whose function calls
  the entry, across families. Never append to the sink with sites from `ProvenanceSites`: the type graph reaches
  entries a function never runs.
- A family that takes its verdict from another family's entry (validationErrors from validate) lists it in
  `adoptsFindingsOf`.

## 5. No silent fallback

- An arm that cannot compile returns `CodeNS`, so the entry renders an alwaysThrow with a root code. Never return empty
  code for a value you did not handle: that ships an identity (for `validate`, "accept everything").
- A property only drops a value through `strippedPropertyDrop` / `indexSignatureValueDrop`, which emit the note. There
  is no "absorb and carry on" path, and a failing kind with no code throws under `TFN001` (an internal bug, file it).

## 6. Keep every shortcut in step with the emitter

The noop, JSON-compat and safe-to-share predicates (`noop_types.go`, `json_compat.go`, `extraProofRecursive`) decide
"no work needed" WITHOUT walking. When one says yes, the child is never compiled.

- A kind the emitter refuses must answer "no" there too (the `NonDataOf` guard at the top does this for non-data).
- A child the noop gate skips is still rendered for its findings (`recordElided`); keep new gates on that path.
- The runtime tripwire `noop-predicate mismatch` on stderr means a predicate and an emitter disagree: fix the arm.

## 7. Add it to the grid

`TestNestedDiagCorpus` (`compiler/resolver/nested_diag_corpus_test.go`) puts every trigger at every position, inline
and named, under every family and both inline modes, and checks: a throw is reported, a reported throw exists, inline
and named agree, non-data is never dropped silently, the build pass equals the dev scan.

- A new non-data shape gets a row in `corpusTriggers`; a new family, a row in `corpusFamilies`. The two
  `TestNestedDiagCorpus_Covers*` gates fail until you do.
- Pin the specific case with a paired test too (static `createX<T>()` and value `createX(value)`), per the Marker test
  coverage rule.

## 8. Before you finish

- `go -C ts-go-runtypes test ./internal/... ./cmd/...`, then `pnpm run check:builds` and `pnpm test`.
- A changed disk-cache payload bumps `diskcache.FormatVersion` and the version `cache-disk.test.ts` pins.
