---
type: fix
spec: guidelines
status: ready
created: 2026-09-28
---

# No build diagnostic is hidden because its trigger sits on a nested type or element

## Intent

A build diagnostic must reach the call site whose function it affects, wherever the trigger sits in the type.
Two silent paths of this kind turned up while hardening `removeUnknownKeys`, both now fixed:

- A root code (the "always throws" RuntimeErrors: VL001-003, VE, PJ/PJS/RJ 00x, RUK001/004-006) was reported
  only at a call site that NAMED the failing type. `createValidateFn<{inner: Inner}>()` with
  `interface Inner { s: symbol[] }` built clean, yet its function always threw.
- A property whose value failed to compile could be dropped with no diagnostic (the `propertyChildFailed`
  absorb path in `ts-go-runtypes/internal/cachegen/typefunctions/union_strip.go`): `removeUnknownKeys` no longer
  uses it, the other families still do.

Nobody has checked the rest systematically. Find every code that fires at the root but not one position deeper,
and every always-throw that builds clean, across every family.

## Direction

The implementer plans the details. Starting points:

- Positions to cover: property (required and optional), array element, tuple element (plain, optional, rest),
  Map key and value, Set value, index-signature value, union member, intersection, and the same child as an
  inline type versus a named (external) entry.
- Families: validate, validationErrors, the strict and union-keys validators, the JSON encoders and decoders
  (clone, mutate, compact), removeUnknownKeys and its `sharedValues` twins, formatTransform.
- A generated corpus (each root trigger crossed with each wrapper position) that asserts the code reaches the
  outer call site is the cheap way to find the gaps. `TestDiagExamples_TriggerAtDepth` already does one level
  for `ScopeGraph` codes with a `NestedExample`; root codes have no such check.
- Decide per gap: report it at the outer site, or make the family refuse instead of silently dropping.

## Docs

None expected: the website lists what each code means, not where it is reported. If a code's meaning changes,
update its prose in `ts-go-runtypes/internal/diagnostics/prose.go` and regenerate the catalog.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The corpus exists, runs in the normal Go test run, and covers every family and position above.
- Every gap it finds is fixed, each with its own commit and test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Plan (approved 2026-09-29)

- **Corpus**: `ts-go-runtypes/internal/compiler/resolver/nested_diag_corpus_test.go`. Triggers (symbol, function,
  callable interface, never, non-serializable class, private-field class, symbol-keyed interface, object union)
  crossed with every position (property, optional property, array, tuple plain / optional / rest, Map key and value,
  Set, index signature, union member, intersection, two deep), inline and named, in every family, both inline modes,
  scan and generate, both marker call shapes. Oracle: every alwaysThrow entry in the output has its code reported at
  the site, every reported always-throw code has an alwaysThrow entry, and a trigger that builds without a throw
  leaves a drop diagnostic.
- **Expected gaps** (confirm with the corpus, fix each with its own commit and test):
  - a throw reached through ANOTHER family (validationErrors union arm calls the `val_` entry) is never reported;
  - a callable interface property drops with no diagnostic when inlined and throws when named: drop it like a
    function (…010 Info) in every mode;
  - with that handled, remove the absorb path (`propertyChildFailed` -> `AbsorbUnsupported`) so an unsupported
    property refuses instead of vanishing.
