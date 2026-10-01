---
type: chore
spec: guidelines
status: done
created: 2026-09-30
---

# Finish hardening build diagnostics against nested and hidden cases

## Intent

An audit of nested build diagnostics, and the prevention work after it, shipped four safeguards: one shared "is it
data?" decision (`reflection.NonDataOf`), grid coverage gates on `TestNestedDiagCorpus`, the `add-diagnostic` checklist
skill, and per-call-site diagnostic rules D1 to D3 in the non-data type fuzz lane. They went in without a separate plan
review, and each left loose ends. This todo keeps everything learned so the next pass can plan it properly: what is
still hand-written, which checks are thinner than they look, which budgets are open questions, and which decisions
were taken and why.

## What exists today (the starting point, verify before planning)

- `reflection.NonDataOf` (`ts-go-runtypes/internal/reflection/nondata.go`) classifies a node as data or one of four
  stripped classes (function, symbol, never, opaque: Promise / RegExp / non-serializable class). It drives
  `isStrippedUnionMember`, `isCallableValue`, `strippedMemberLabel`, `rootCodeMap.codeFor`, the top guard of the JSON
  noop / compat / safe-to-share predicates, and the wire `NotSupported` flag (`PopulateFamily` now takes a resolver).
- `nondata_agreement_test.go` (typefunctions) builds a root per reflection kind plus four shapes and checks every
  family with a root code agrees with `NonDataOf`. Two exceptions are named there: removeUnknownKeys copies or
  shares non-data by its own rules, and the validators compile `never` to an always-false check.
- `TestNestedDiagCorpus` (resolver) is the trigger x position x family x inline-mode grid; `Covers*` gates fail when a
  family (JSON Schema and the class-serializer card are exempt with reasons) or a non-data kind has no row. `any` and
  `unknown` triggers must never throw or error.
- `ReportReachedFindings` (typefunctions/module.go) is the one place findings travel from an entry to the sites whose
  function calls it; a walk reports only at sites that named its type. `adoptsFindingsOf` lets the validationErrors
  families take validate's findings. Children the noop gate skips are rendered for findings only (`recordElided`,
  cache `ElidedRefs`, disk format v20).
- The fuzz lane (`packages/run-types/test/fuzz/type/`, `diagOracle.ts`) wires nine functions per random type and
  checks D1 (every throw is a `[CODE]` reported at its site), D2 (a reported always-throw really throws), D3 (a member a
  round trip dropped left a note). `diagnosticTruth.smoke.test.ts` replays the seeds it failed on.
- `TFN001` is the internal code for a failing kind with no root code (was a silent identity fallback).

## Direction (the implementer plans the details)

### 1. Finish "decided once"

- 23 hand-written `isFunctionLikeKind(...)` calls remain in typefunctions (object member skips for methods, the union
  flat layout, compact, `jsonNoopObjectChildren`, removeUnknownKeys, unknownkeys_shared, formattransform). Most test a
  MEMBER kind (method / method signature) rather than a value, so decide per call whether it should read `NonDataOf`
  or stays a member-shape test, and write the rule down in the add-diagnostic skill.
- `objectHasCallSignature` and `callableLeafSubstitute` (kinds.go) still exist beside `NonDataOf`, because
  `rootCodeMap.codeFor` runs without a resolver. Consider giving `DiagCodeForLeaf` the ref table so the substitute can go.
- The noop predicates for validate, validationErrors, removeUnknownKeys and formatTransform do not use the guard, on
  purpose (their non-data behaviour differs). Confirm each and record why next to it, or the next reader "fixes" it.
- The agreement test checks ROOTS only. Member positions are covered by the grid; decide whether a cheap per-kind
  member-position check belongs in the agreement test too.

### 2. Fuzz `NonDataOf` against `DataOnly<T>`

`DataOnly<T>` (`packages/run-types/src/runtypes/dataOnly.ts`, the TypeScript type) and `reflection.NonDataOf` (Go)
make the same decision twice, in two languages, and nothing checks they agree: only comments tie them. Promise was
exactly this drift: the wire `NotSupported` flag treated it as data, so mocks drew Promise union members every
validator refused. A fuzz rule closes it, because the fuzzer already draws every stripped kind in every position.

- Where: the non-data type lane (`packages/run-types/test/fuzz/type/`, generator preset `NONDATA_GEN_OPTIONS` in
  `fuzz/core/typeGen.ts`), as a new rule next to D1 to D3 with its own negative control.
- Oracle to start from: `assertDataOnlyEquivalence` (`packages/run-types/test/util/idIntegrityAsserts.ts`) already
  checks, per hand-written case, that `createValidateFn<DataOnly<T>>()` gives the same verdicts as
  `createValidateFn<T>()` on valid and invalid samples. The fuzz rule does the same per random `T`: the harness writes
  both call sites, the checker evaluates `DataOnly<T>`, and the two validators must agree on the mock value and on
  mutated values (a removed member, a wrong-typed member).
- Stronger, if cheap: compare shapes instead of verdicts. The reflection of `T` with its `NotSupported` members
  removed should equal the reflection of `DataOnly<T>`. Their ids differ by design (the reflection of `T` keeps each
  dropped member as a `NotSupported` node, the comment on `assertDataOnlyEquivalence` explains), so compare member
  lists, not ids.
- Root case: when `DataOnly<T>` is `never`, `NonDataOf(T)` must be non-data too, so the `T` factory throws with a root
  code. The hand-written suites mark these `dataOnlyDivergent`; the fuzz rule must treat them as agreement, not skip.
- Known differences the oracle must allow or the generator must avoid: `DataOnly` stops at `Depth` 8, so deeper types
  diverge by design; Temporal types are kept through the `DataOnlyNativeExtra` augmentation; a written `any` or
  `unknown` is data on both sides.
- A disagreement found is a bug in one of the two: decide which side is right from the DataOnly contract, fix it, pin
  the seed in a smoke test (like `diagnosticTruth.smoke.test.ts`).

### 3. Make the fuzz lane stronger

- D2 only sees throws at creation or on one call with the mock value. A throw reached lazily (a branch the value
  does not take) is invisible; decide whether that can exist and, if so, how to probe it.
- D3 only compares members present in the mock value; members the mock never produced are unchecked. It skips a
  `null` under compact by design (compact writes an absent optional as `null`).
- The lane covers the plain families plus in-place JSON and removeUnknownKeys. Not covered: the `checkUnknowns` and
  `checkUnionUnknowns` validators, removeUnknownKeys `share` / `refuse`, formatTransform.
- The old O10 rule ("both encoders throw, so some Error exists anywhere") is now weaker than D1; merge or remove it.
- A validator that silently accepts everything is not caught by D1 to D3 on the mock lane. The wild lane's O2
  (corrupted value rejected) could run on the mock lane where nothing is dropped.
- Lessons the harness paid for: call-site positions are UTF-8 BYTE offsets, and diagnostic lines break where
  TypeScript breaks (`\r\n`, `\r`, `\n`, U+2028, U+2029). Check the other fuzz harnesses that map positions to lines.

### 4. Decide the budgets

- PR CI runs the non-data lane time-boxed at 10 s and a fixed 100-type batch (about 58 s, was 55 s before D1 to D3);
  `release-gate.yml` and the hand-started `fuzz-soak.yml` run it at 60 s. Two hand-run 10-minute soaks (about 3,300 to
  3,800 types each) found one real gap each (symbol-keyed index signatures, then the in-place codecs merging them away)
  that 60 s may well miss. Decide whether the release soak for this lane should be longer, or the lane faster.
- `TestNestedDiagCorpus` adds about 50 to 90 s to the Go suite on 4 cores (one parallel subtest per trigger; value
  call shape only in the default inline mode). Measure its share of the CI Go job and trim or split if it matters.
- `ReportReachedFindings` walks every rooted entry's closure (roots x graph) and `recordElided` renders extra noop
  entries. Neither was measured on a large project; check the render metrics on the benchmark fixtures.

### 5. Open decisions to settle

- `adoptsFindingsOf` is a hand-kept map (verr / vest / veuk adopt val / vst / vuk). Derive it from the operations
  registry (a "takes its verdict from" field) so a new delegating family cannot forget it.
- `TFN001` and `JCP001` are internal-bug codes that appear on the public All Diagnostics page (serialization section).
  Decide whether internal codes belong there.
- The validation page's first `::note` now holds two paragraphs (the second on `any` / `unknown`); the docs pass
  flagged it as a structure call (a note should be one or two sentences). Consider a short section instead.
- The validation page lists what is skipped as non-data but does not name `Promise`, which every family and the mocks
  now strip. Add it if the reader needs it.
- The comments pass left long pre-existing docs untouched (for example `buildMergedProps`, 8 lines); out of scope then.

## Decisions already taken (do not reopen without a reason)

- A written `any` or `unknown` is data, kept for third-party types: accepted at every position in every family, a
  required member only needs its key, an Info at a root (`VL021` / `VE020`), never an error. An `any` that came from an
  unresolved name, import or lib is a RuntimeError (`MKR007`, `MKR013`, `TMP001`, `CFG002`). Pinned by the grid.
- An interface with a call signature is a function to DataOnly, fields or not: a noted drop at a property, a throw at
  a propagating slot.
- A throw reached through another family (the validate entry a union calls) is reported only when the site's own
  family reaches no throw, so one failure is never named twice.
- A property never absorbs a value no family can compile: the object refuses, and a kind with no root code throws
  under `TFN001`.

## Docs

Only the open decisions in section 5 touch pages: the validation guide (`container/website/content/02.runtypes/
02.guide/03.validation.md`, the first note) and the generated All Diagnostics page. The rest is Go, tests and the
`add-diagnostic` skill.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every item above is either done, or recorded as decided-and-why in the file it concerns (never only here).
- The fuzz lane fails on a random type where `DataOnly<T>` and `NonDataOf` disagree, shown by a negative control (a
  kind stripped on one side only), and the add-diagnostic skill names it as the check for a new non-data shape.
- Each behaviour change has its own commit and paired tests (static and value call shapes); each new rule has a
  negative control showing it fires.
- The Go suite, the full JS suite and the non-data fuzz lane pass, plus one long soak with no new finding.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each
  committed on its own.

## Plan — finish every item (approved 2026-10-01)

1. Split the 23 `isFunctionLikeKind` calls: member-shape tests become `isMethodMember`, value tests read the
   `NonDataOf` helpers; write the rule into the add-diagnostic skill.
2. Give `DiagCodeForLeaf` a ref resolver; remove `callableLeafSubstitute` and `objectHasCallSignature`.
3. Say next to the four unguarded noop predicates why they skip the guard; keep the agreement test to roots.
4. Add the D4 fuzz rule (`DataOnly<T>` against `NonDataOf`: root, validator answers, member lists) with negative
   controls, fix what it finds, pin the seeds.
5. Strengthen the lane: the missing families, a second mock draw, O10 out, O2 on the mock lane.
6. Soak the non-data lane 10 minutes in its own workflow; measure the grid and the reach walk.
7. Derive `adoptsFindingsOf` from a registry field, badge the internal codes, split the validation note.

## What shipped

**1. Decided once.**
- `isFunctionLikeKind` is gone. 16 member-shape calls read `isMethodMember`; the 7 value calls read the `NonDataOf`
  helpers. That fixed a real bug: a `checkUnknowns` validator counted a dropped symbol / RegExp / Promise member as
  a key, so `{a: symbol; b: number}` rejected `{b: 1}`. Those members now behave like function members (the
  validator works on the data-only view, so a present non-data member is an unknown key).
- `DiagCodeForLeaf` and `leafKindLabel` take a resolver; `callableLeafSubstitute` and `objectHasCallSignature` are gone.
- The four unguarded noop predicates say why next to them. The agreement test stays on roots: the grid's
  `CoversEveryNonDataKind` gate already runs every non-data kind at every member position (recorded in its header).

**2. D4.** `packages/run-types/test/fuzz/type/dataOnlyOracle.ts`, with unit negative controls and an end-to-end
control (a `NoStrip<X> = X` stand-in fires it). It found two `DataOnly` bugs, both fixed in `dataOnly.ts`:
an optional non-data member projected to `p?: undefined`, and a type whose members are all optional passed the
broad-`object` test and was kept as is, functions included. The fix costs 1 to 8% more type instantiations on the
branches with dropped members; the budgets in `dataonly.compile.test.ts` were raised to the measured numbers, a
reviewed exception. Standard-library classes (`URL`, `Error`, `Blob`) stay the one known gap: the Go side skips any
lib-declared class and a type cannot tell where a class was declared. Recorded in `dataOnly.ts` and the oracle header;
the generator draws none. Seeds pinned in `dataOnlyAgreement.smoke.test.ts`.

**3. The lane.**
- Lazy throws do not exist: a non-data value that cannot compile makes its entry throw when the function is created
  (checked on unions, optional members, records and Maps). Recorded next to `checkDiagnosticTruth`.
- D3 also runs on a second mock draw with every optional member present. The compact `null` skip stays.
- New sites: `checkUnknowns`, `checkUnionUnknowns`, removeUnknownKeys `share` / `refuse`, formatTransform.
- O10 removed; O2 runs on the mock lane when the validate site notes no drop.
- One mock draw is shared by every check (a slow mock otherwise ran three or four times per type).
- Only `typeFuzzHarness.ts` maps positions to lines; the byte-offset and line-break rule is in the add-diagnostic skill.

**4. Budgets.** The non-data lane soaks 10 minutes in `.github/workflows/fuzz-nondata-soak.yml` (release PRs and
manual runs), out of the release gate's matrix through `soakWorkflow` on its `FUZZ` entry. The grid measured 74 s alone
on 4 cores (the Go suite 301 s, 128 s without it); its value call shapes are more than half of that, so they run only
with `MION_DIAG_GRID_FULL=1`, which the release gate sets. Splitting the grid into its own CI job was ruled out: the Go
lane's green marker would then claim a result its job did not prove. The reach walk is timed in the render metrics
(`RenderMs.reachedFindings`): 1.4 ms, and the elided renders about 15 ms, of a 198 ms request over 120 types x 5
families, both under the 10% bar, so neither changed (numbers next to `ReportReachedFindings`).

**5. Decisions.** `VerdictFrom` on the operations registry builds `adoptsFindingsOf` (now the three one-to-one
pairs, not a cross product), pinned by `TestVerdictFrom_MatchesTheUnionDelegate`. `Internal` on `Definition` marks
TFN001 and JCP001; the catalog page badges them. The validation page names promises as skipped and gives `any` /
`unknown` a short section. Long old comments were left to the comments pass over the touched files.

**Found on the way, delegated.** `createMockDataFn` takes seconds for a nested `Set<Map<…>>` (seed 3635804914 tripped
the soak's slow-round ceiling). Filed as its own todo and fixed in a parallel session's PR.
