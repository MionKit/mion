---
type: fix
spec: guidelines
status: done
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

## What shipped

**The corpus.** `TestNestedDiagCorpus` (`ts-go-runtypes/internal/compiler/resolver/nested_diag_corpus_test.go`) runs in
the normal Go suite, one parallel subtest per trigger (about 50 s on 4 cores). Triggers: symbol, `symbol[]`, function,
callable interface (with and without a field), never, typed array, `#private` class, symbol-keyed interface, object
union. Positions: property, optional property, array, tuple plain / optional / rest, Map key and value, Set, index
signature, union member, intersection. Each as an inline and a named child, under all 16 family variants, in both
inline modes, static call shape in both modes and value shape in the default mode. Rules checked per file: every
runtime throw is reported at the site, every reported always-throw code has its throw, inline and named report the
same codes in both modes, a non-data trigger is never dropped with no diagnostic, and the build pass reports what the
dev scan did. The oracle reads the `[CODE]` prefix of the rendered alwaysThrow messages, so no cell has a hand-written
expectation. The root-position case stays with `TestDiagExamples_TriggerTheirCode`.

**Gaps found and fixed**, each with its own commit and paired tests:

- A throw reached through ANOTHER family's entry was never reported: a validationErrors or removeUnknownKeys union calls
  the validate entry of the union (`{u: symbol[] | string}` threw at runtime and built clean). The reach walk now runs
  once after the cross-family fixpoint. A foreign throw is reported only when the site's own family reaches none,
  so a JSON encoder whose union already reports PJS002 does not also get VL001.
- An interface with a call signature and a field threw at a property when named and vanished with no diagnostic when
  inlined, taking a throwing array element with it. It is now function-like everywhere: dropped with the family's
  …010 note at a property, a reported throw elsewhere. The JSON noop and JSON-compat predicates mirror that, which also
  fixed the clone encoder shipping it inside a Map or Set as `null`.
- The absorb path (`propertyChildFailed` / `AbsorbUnsupported`) is gone: an unsupported property value makes the object
  refuse. An entry whose failing kind has no root code used to be skipped, so the site ran the family identity; it now
  throws under the new internal code `TFN001`.
- A function-valued index signature was dropped with no note in every family; it now leaves the …010 note.
- validationErrors had no way to show what the validate entry it delegates to drops (VL013 / VL014). Entries now keep
  their own findings (persisted in the disk cache, format v19), and the validationErrors families adopt those of the
  validate families.
- A named child the noop gate left out was never rendered, so the in-place encoder hid its dropped symbol key. It is
  now rendered for its findings only (pruned from the output) and the cache keeps the list for warm builds.
- Findings reached a site through its TYPE, so a union site heard VE013 or RUK004 from an entry another file demanded
  and its function never calls, and the build disagreed with the dev scan. A walk now reports only at the sites that
  named its type, and `ReportReachedFindings` carries findings along the entry graph the site's function calls.
- Found in passing on the same shortcut: the clone encoder copied Map and Set entries with `Array.from`, so object
  values kept every undeclared key on the wire. The shortcut now also requires values that are safe to share.

Docs: no page changed. The diagnostics catalog gained `TFN001` (prose, message, generated catalogs).
