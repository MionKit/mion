---
type: chore
spec: full-plan
status: ready
created: 2026-08-27
---

# Drizzle manifest: reviewable non-column exports + array() format fix

## Problem

The manifest generator (`ts-go-runtypes/cmd/gen-drizzle-manifest/`) classifies every
export as `column` (review lifecycle: pending -> migrated/skipped) or `helper`
(blanket auto-skip, reason "not a column builder; passes through via export *").
Verified against drizzle-orm 0.45.2: 384 helper entries, of which 295 are classes and
3 are non-function values (correctly auto-skipped forever), but 86 are REAL callable
functions (pgEnum, customType, pgTable, index, unique, foreignKey, check, views, set
operations, ...) that never get a human review. A new drizzle helper export lands
silently auto-skipped; nobody ever asks "could this map to runtypes or deserve a new
typeformat?". The merge in `manifest.go` also OVERWRITES any hand-edit on a helper
entry, so there is no way to explicitly mark one as reviewed today.

Separate but related untracked finding (modifier investigation, 2026-08-27): pg's
`.array()` chain modifier drops the format stamp (`text('t').array()` infers
`string[]`, not `String[]`) because drizzle re-derives the element type in its array
builder instead of carrying `this`.

## Plan

Generator (`ts-go-runtypes/cmd/gen-drizzle-manifest/gen.go`, `classifyExport`):

1. Split `helper` into two kinds:
   - `function` - callable (has call signatures) but not a column builder. 86 today.
     Reviewable: arrives `pending` (the gate already fails on pending), a human flips
     it to `migrated` (a wrapper/mapping exists as a LOCAL proxy export) or `skipped`
     with a required hand-written reason - that IS the explicit "no mapping needed"
     marker. Record overload param texts for these too, so an upstream signature
     change (drizzle upgrade) downgrades a reviewed entry back to `pending` exactly
     like columns.
   - `passthrough` - classes and non-callable values (construct signatures only, or
     not callable). Always generator-owned auto-skip with a fixed reason; no params
     recorded (class constructor churn would bloat the manifest); hand-edits ignored.

2. Merge rules (`manifest.go`, `merge`): preserve `status`/`reason` for kinds
   `column` AND `function`; the param-drift downgrade (migrated -> pending with the
   old shape in reason) applies to both. `passthrough` entries are fully regenerated
   each run.

3. Validation (`manifest.go`, `validate`): a `migrated` function must be a local
   export of the dialect proxy (same AST scan as columns); a `skipped` function
   requires a reason; add a zero-functions-per-dialect guard next to the
   zero-columns one (classifier-break detection).

4. Seeding pass: the first regenerate flips all 86 existing functions to `pending`;
   review them in one pass (extend the drizzle-proxy-migration skill loop). Expected
   outcome per the current analysis: nearly all become `skipped` with real reasons
   (tables/indexes/constraints/views/set-ops are query plumbing with no per-value
   validation semantics; customType and pgEnum keep drizzle typing which is already
   exact). The value is the forced review and the future drift gate, not new
   wrappers. If the pass concludes some function DOES deserve a mapping or a new
   typeformat, that becomes its own follow-up todo.

5. `.array()` (folded finding): attempt a contained type-level fix - extend the
   stamp so the array method's return carries the element format
   (`text('t').array()` -> data `String[]`) by intersecting an `array()` override
   into the stamped builder type. If that fights drizzle's PgArrayBuilder generics
   past reasonable effort, fall back to: pin the current `string[]` behavior in
   `proxy-pg.stub.ts` and document `.array().$type<String<{...}>[]>()` as the escape
   hatch on the website Column Formats page. Either outcome must be pinned.

## Tests

- Go (`gen_test.go`): fixture gains a lowercase callable helper and a class; assert
  the three kinds classify correctly, functions carry params and arrive pending,
  passthrough auto-skips; merge preserves function statuses and downgrades on param
  drift; validate rejects a reasonless skipped function and a migrated function that
  is not a local export.
- JS (`packages/drizzle/src/proxies/manifest-coverage.spec.ts`): every `function`
  entry exists on the proxy namespace; migrated functions are callable; skipped
  functions carry reasons.
- Stub (`proxy-pg.stub.ts`): the `.array()` pin (formatted elements if the override
  ships, the documented current behavior otherwise).
- No marker-API surface is touched, so the paired getRunTypeId rule does not apply.

## Docs

Contributor-facing: update `.claude/skills/drizzle-proxy-migration/SKILL.md` with the
function-review loop and the hand-edit rules (functions: status/reason only, same as
columns). Website: only if the `.array()` override ships (one line on the Column
Formats page); the function review itself is invisible to consumers.

## Fuzzing

Not a candidate: deterministic codegen whose oracle is the committed manifest plus
the `--check` gate itself.

## Out of scope

- Enumerating chainable BUILDER METHODS (`.notNull()`, `.default()`, ...) in the
  manifest: they are class methods, not module exports; the modifier investigation
  (2026-08-27) showed they already compose with the stamps, and `.array()` - the one
  gap - is handled directly above.
- Wrapping table-level constructs (pgTable, pgEnum, indexes) with behavior changes:
  they stay passthrough at runtime; this todo only makes their review status
  explicit.
- New typeformats: if the review pass concludes some function deserves one, that is
  its own follow-up todo with its own design.

## Done when

- The manifest carries kinds `column | function | passthrough`; the 86 current
  functions are hand-reviewed (no pending left) with explicit reasons or mappings.
- A NEW drizzle function export (or a signature change to a reviewed one) fails
  `pnpm rtx core drizzle-manifest --check` until reviewed; class/constant churn never
  does.
- Hand-set function statuses survive regeneration.
- The `.array()` decision is implemented and pinned (override or documented escape
  hatch).
- Go + drizzle test suites, the manifest gate, lint/format all green; the
  drizzle-proxy-migration skill documents the new loop.
