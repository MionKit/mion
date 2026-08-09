---
type: feature
spec: full-plan
status: ready
created: 2026-08-09
---

# Full Temporal support in the convert CLI (with an any-resolution guard)

## Problem

Temporal-bearing declarations refuse in ALL convert targets, via two paths:
unbranded members (`temporalPendingDiag`, internal/convert/print.go, three
call sites in the KindClass branches) and branded annotations
(`formatFamilies` has no temporal rows, so `TFT.Instant<{min}>` hits the
generic format refusal). DECIDED (2026-08-09): support the migration fully.
Additionally — the decided hard guard does not exist on the convert path
today: TMP001 ("Temporal type resolved to 'any': add ESNext.Temporal to
compilerOptions.lib") is raised ONLY by the resolver's marker-call-site scan
(resolver/scan.go:640/869 via resolver/temporal_guard.go, syntax-based);
convert enters through `cache.SerializeTopLevel` (internal/convert/
resolve.go:50), which has no diagnostic channel — with the lib missing,
`Temporal.Instant` projects as KindAny and the converter would print
`any` / `RT.any()`, CEMENTING the destroyed type into the rewritten source.

## Plan

1. **The any-guard first (the hard requirement).** New per-declaration check
   in internal/convert beside `outsideSetDiags`: walk the declaration's
   written type nodes for qualified `Temporal.<Name>` references (reuse
   `reflection.TemporalNamespace` + `TemporalInfoByName`; mirror the walk in
   resolver/temporal_guard.go:41-64 — detection MUST be syntax-based, since
   the resolved type is plain `any` with no symbol to inspect) whose checker
   type is `any` → new diagnostic `CNV007`, same message intent as TMP001;
   declaration untouched, exit non-zero. Runs for every target, before
   printing.
2. **Unbranded rows** (replace `temporalPendingDiag` at its three sites) —
   the reflected node is KindClass, SubKind 2101-2108, `ClassRef.Builtin`
   `"Temporal.<Name>"`, no Arguments (serialize.go projectClass early
   return):
   - type target: `Temporal.<Name>` via the existing `classSpelling`
     Builtin path;
   - builders target: the natural `TFT.<builder>()` — all 8 exist as flat
     named exports of `@ts-runtypes/core/formats/temporal`
     (`instant` … `duration`, src/formats/datetime/temporalFormats.ts:202-216;
     the ROADMAP's `temporal.instant()` namespace spelling is stale prose).
     The no-params call returns the UNBRANDED base instance type, and the
     structural id is the SubKind number for both routes (typeid.go:560),
     so convergence is by construction — the chain oracle verifies;
   - json-schema target: `embedType<Temporal.<Name>>()` — the door
     deliberately keeps Temporal out of `JsTypeName`/`JsFormatName`
     (fromJsonSchema.ts:106-113), so embed is the aligned spelling;
     `--portable` refuses (CNV006).
   Do NOT use `RT.classType(Temporal.X)`: validate-by-shape vs Temporal's
   instanceof semantic, invisible to the TMP001 guard (no type arguments),
   and 6/8 fixture ctors lack `new`.
3. **Branded rows**: add the 6 orderable families
   (`temporalInstant` … `temporalPlainYearMonth`) to `formatFamilies` —
   builders `TFT.<builder>({min, max})`, type target `TFT.<Brand><{…}>`
   (brand aliases `Instant`…`PlainYearMonth` exist,
   temporalFormats.ts:85-113), schema `embedType<TFT.<Brand><{…}>>()`.
   `plainMonthDay` / `duration` have no brands (no-params only) — nothing
   to add there.
4. **Fifth managed import module**: `@ts-runtypes/core/formats/temporal` as
   namespace alias `TFT` — extend `importNeeds` (new flag), the `nameTable`
   (collision-claimed local), `managedRoles`, and the managed-module list in
   internal/convert/imports.go.
5. **Test harness**: mirror `setupInlineWith`
   (resolver/inline_test.go:80-83) — overlay
   `testfixtures.TemporalDTS` AND append it as a program ROOT in an opt-in
   variant of `setupConvert` (it is an ambient d.ts, unreachable by import).

## Tests

- Chain tests (id + C6 oracles, all six directions): `{at: Temporal.Instant}`;
  an all-8 sweep declaration; branded `TFT.PlainDate<{min: '2020-01-01'}>`;
  `--portable` refusal (CNV006 on the embed).
- The any-guard: the same fixtures WITHOUT the ambient → CNV007 on every
  target, file untouched, exit non-zero (CLI e2e can reuse the
  convert-cli.test.ts harness with a Temporal file and no lib).
- Fuzz: a Temporal arm in the convert sweep, gated on the ambient overlay.
- No JS door change → no new door tests; the marker-coverage rule is
  satisfied by the existing temporal builder suites plus the chain tests.

## Docs

Convert guide "What converts" gains Temporal; ROADMAP convert row's refusal
note updates; FUZZING.md if the arm lands; docs/done/format-conversion-
completion.md decision 7 already points here.

## Out of scope

`jsType` Temporal rows in the schema door (embed-only posture stands, so the
json-schema surface never drags the Temporal lib); making `--portable`
express Temporal; a `classType` spelling; changes to TMP001 itself or the
marker-scan guard.

## Done when

All 8 Temporal types convert in all six directions with unchanged ids and
C6-equal graphs (branded orderable forms included); a project missing
`ESNext.Temporal` gets CNV007 on every target — never a silent `any` — and
the CLI exits non-zero with the file untouched; full Go + JS suites, lint,
format green.
