---
type: feature
spec: guidelines
status: ready
created: 2026-08-07
---

# Re-apply the JSON Schema review program from current main

## Intent

A full review-and-refactor program for the JSON Schema door was built and
verified on `feature/json-schema-gate-trims` (PR #320), but that branch
forked from main BEFORE three sibling programs landed the same evening:
keyword-first formats (#317), the official Test-Suite conformance lane
(#318) and the unevaluated* runtime-set sweep (#319) — 51 commits touching
22 of the same files, in places solving the same problems differently.
Rebasing was judged worse than redoing: every item below must be
RE-VERIFIED against the current tree first, then re-applied, adapted, or
dropped with a recorded verdict. The discarded implementation remains
visible in PR #320's pre-rewrite history as reference material only —
nothing from it may be cherry-picked without re-verification.

## Direction

Work the items in order; for each, the FIRST step is re-establishing the
premise on current main (the sibling programs may have fixed, moved, or
re-encoded what the original found). The implementer plans the details.

1. **propertyNames duplicate-drop (fix).** On the old base, allOf-stacked
   propertyNames enforced only the last-lifted child while the structural
   id folded them all (id ≠ behavior — the serialize collapse assigned a
   single slot, `pn{…}` appended). Re-check the encoding on main (the
   keyword-first rework may have changed it); if the class survives, fix
   with append semantics end to end and pin: both arms enforced, id stable
   across arm order, both getRunTypeId shapes.
2. **Format definitions out of the mapping file (chore).** fromJsonSchema.ts
   defined the jsonContent brand, RFC 4648 encoding presets and mock pools
   inline, plus a private StructuralBrand twin. Re-check what #317 left;
   relocate survivors into formats/ (own extract region so the compile and
   fuzz harnesses slice it — no stand-in data duplication), export
   StructuralBrand once.
3. **StripRunTypeMeta + JsonSchemaType (feature).** The annotation-grade
   projection: format brands collapse to their base, sentinel slots drop,
   structure survives; mutually assignable with the full type; NEVER
   reflected (the metadata IS the validation contract — DataOnly stays the
   reflection-safe projection and must keep sentinels). Compiler facts
   established by probing (should still hold, re-verify cheaply): TS has NO
   generic intersection subtraction (`infer B & Pattern` only subtracts an
   identical pattern), so the walker is wide-brand collapse + element
   inference for branded plain arrays + key-filtered maps for objects, with
   keep-verbatim residuals for branded tuples and branded literals; DataOnly
   depth discipline; budget-ratchet compile tests per the
   dataonly.compile.test.ts protocol.
4. **Official-suite TYPE gate (feature).** The assignability half: every
   spec-valid sample must assign to JsonSchemaType<typeof schema> with zero
   TS errors. Main now OWNS test/json-schema-official/ (the #318 validator
   lane with its divergence ledger) — integrate INTO that lane's structure
   and conventions rather than beside it, and consider driving the gate
   from the lane's pinned real-suite corpus instead of the curated
   spec-cases corpus. Mechanics that carried: group-batched snippets
   through the sliced-region harness; filter TS2353 (the fresh-literal
   excess-property check — open-world semantics; the
   suppressExcessPropertyErrors flag was removed in TS 5.5); negative
   samples never asserted; expected-fail entries are bidirectional pins.
5. **Mapping trims (chore).** Re-verify each against #317/#319 before
   touching: (a) minItems as an arrayFormat param instead of the padded
   tuple (was a mode-divergence fix; keyword-first formats may have done
   it); (b) drop the readOnly → readonly modifier lift (zero validation;
   widens the dropped-intent-warnings todo); (c) mixed properties +
   additionalProperties — 693d7077 changed sibling semantics, re-derive
   whether the TYPE-level over-narrowing still exists and whether the
   emitted index sweep still skips declared keys; (d) fixed-width format +
   length sibling stays never UNLESS emitters grew length-param support
   (relaxing without it silently unenforces declared bounds).
6. **Slot encodings for dependentSchemas / dependentRequired / if-then-else
   (chore).** The channel doctrine: children ride sentinel slots (appended
   under intersection), JSON-config data rides params (merged with conflict
   detection) — refined by composition: data whose allOf composition is
   conjunction (dependentRequired name lists, contains bounds) rides
   slot-side too. Reconcile this with #317's keyword-first params doctrine
   and with 4ca6237b's keyword-semantics fixes (THOSE TESTS ARE THE TRUTH
   the new encodings must satisfy; the encodings should win only the
   representation). Kit checklist per slot: protocol slices with APPEND,
   single-prop member probes + skip-lists, BOTH collapse lifts (id fold and
   serialize slot must agree — pin id = behavior), sorted id folds, wire
   writers, validate/verr emitters, loose-matcher and mock gating,
   value-first twins with three-mode convergence pins. Two bug classes the
   original hit, worth pinning proactively: emitter key-sweep GUARDS predate
   new slots (a slot-only node silently skips the block), and a sentinel
   that rides PRIMITIVE bases (ite via the bare conditional's six-kind
   expansion) needs the lift in the primitive branches of both collapses or
   it degrades to a TypeMeta decorator.
7. **Fuzz corpus follow-through.** Multi-propertyNames (and the new slot
   shapes) in the M7 translation fuzz corpus stay DEFERRED until the fuzz
   harness's hardcoded-mapping cleanup — extending the corpus today grows
   exactly the hand-maintained spelling text that cleanup removes.

## Done when

- Every item above carries a recorded verdict against current main
  (re-applied / adapted / superseded-dropped), implemented through the
  normal spec flow with the PR-readiness gate green (full JS + Go suites,
  lint, format, typecheck), specs archived in docs/done.
- The type gate runs in pnpm test inside the official-suite lane; the clean
  types ship with their never-reflect doctrine documented; any surviving
  encoding change pins id = behavior and three-mode convergence.
