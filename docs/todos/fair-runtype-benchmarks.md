---
type: fix
spec: full-plan
status: ready
created: 2026-10-31
---

# Fair runtype benchmarks: same work per case, fair overall scores

## Problem

The validation benchmark compares mion against zod 4.6.5, TypeBox 1.3.30, ajv 8.20.0 (+ ajv-formats 3.0.1)
and typia 14.0.6 over 272 shared cases. Each library has one total map,
`container/benchmarks/competitors/<lib>/cases.ts`, with a cheap check (`build`) and an error list
(`buildErrors`) per case. Nobody has checked, case by case, that each library does the SAME work as mion
using its own real features. Known risks:

- An entry may call a slower or faster path than a real user would, skip a check mion does, or add work
  mion skips. Example: outside STRICT mion ignores unknown keys, but zod `safeParse` also builds a stripped
  copy of the object.
- `NOT_SUPPORTED` claims may be wrong. Most DATETIME cases are opted out (ajv 41, typebox 40, typia 40,
  zod 34), yet `typebox/cases.ts:2062` uses `Type.Refine` for `DATETIME.date` while `ajv/cases.ts:2078`
  calls the same case unsupported. typia opts out of every NaN and Invalid Date case
  (`typia/cases.ts:25-33`), though a custom tag can do that check.
- A `SampleOverride` swaps the timed values (ajv 27, typia 49, TypeBox 3), so speed is measured on other
  data than mion's (`shared/harness/runner.ts` `measureMetric`). They cluster in OBJECT, UNION, UTILITY, TUPLE.
- ajv runs `strict: false` in all 311 instances, which silently ignores a misspelled keyword.
- The errors metric only checks `.length === 0` / `.success`, so a library returning just the first error
  still passes.
- Side benches: typecost finds typia entries by `typia.createIs` (`typecost/typecost.mjs:291`), so typia's
  STRICT cases (`createEquals`, `typia/cases.ts:2756`) silently drop out of typecost and compiletime.
  compiletime compiles each library's own supported set (`compiletime/compiletime.mjs:174`: about 263 types
  for mion, 199 for typia), drops mion's `{checkUnknowns}` / `{rejectCircularRefs}` options (`:101`) and
  ignores exit codes (`:113-116`).
- Overall scores. Speed charts average only the cases EVERY library supports
  (`container/website/app/utils/benchAggregate.ts` `commonBasis`), so the Overall row shrinks to what the
  narrowest library runs and broad coverage gets no credit. The type-checking chart averages each library
  over ITS OWN cases (`aggregateRows`, `lowerBetter` branch), so a slow case only mion runs (Temporal) drags
  mion down: mion is punished for supporting more.

## Plan

This session implements it. The implementing session is the coordinator agent: it spawns every agent
below, owns triage, and is the only one to edit mion files.

Review files: RULES.md, cards, mion sheets, findings, side and harness notes live in
`container/benchmarks/_review/` (written `_review/` below), committed on the branch so they survive the
session and every agent reads the same copy. They are working files only: a last commit deletes the whole
folder before merge, and no other file links to it. Bulky regenerable inputs (library source copies,
generated-code dumps, audit output) stay in `<scratchpad>/bench-review/`, never committed.
At merge the PR holds only benchmark case and logic changes, plus the docs that describe that logic.

### Step 0. Prep (coordinator)

1. `pnpm miondevx container login`, `pnpm miondevx bench prep`, `pnpm miondevx bench smoke`
   (writes unminified `competitors/<lib>/dist/run.mjs`, bind-mounted rw, `scripts/website/bench-data/bench.mjs:128`).
2. `pnpm miondevx bench audit`: per case, which shared samples each override or `NOT_SUPPORTED` hides.
   Keep its output under `<scratchpad>/bench-review/audit/`.
3. Library source: copy each library's INSTALLED `node_modules` out of the image
   (`/bench/competitors/<lib>/node_modules`, symlinks resolved) into `<scratchpad>/bench-review/libsrc/<lib>/`.
   Not npm tarballs: `_deps/` has no lockfile, so second-level deps (ajv-formats → ajv, fast-uri) are not pinned.
   Untrusted data, never executed.
4. Generated code dumps, one file per case and metric under `<scratchpad>/bench-review/gen/<lib>/`:
   - mion: default emit mode is `code` (`ts-go-runtypes/cmd/mion/main.go:166`), so validator bodies are
     string literals in `dist/run.mjs`; helpers live in `packages/run-types/src`. Extract them per case.
   - typia: inlined in its `dist/run.mjs`.
   - ajv, TypeBox, zod generate code at run time. A small dump script in the scratchpad, run inside the
     bench image (`pnpm miondevx bench shell`), calls each builder and prints the compiled source
     (ajv `code: {source: true}` + `validate.toString()`, TypeBox's compiled check code, zod's compiled
     function). Where a library cannot dump, reviewers read the interpreter path in its source.
5. Wave 0 rulings: the coordinator decides ONCE each recurring cause, so reviewers never argue them
   separately: NaN / Infinity, Invalid Date, plain-object guard, Temporal `instanceof`, bigint bounds,
   cycle detection, unknown keys (ignore vs strip vs reject), typia `createIs` vs `createEquals`,
   ajv `strict`. Each ruling = what mion does + the allowed way per library. Written into RULES.md.
6. Write `_review/RULES.md` = the "How to compare" section below + the Wave 0 rulings.

### Step 1. Wave 1, knowledge (parallel, fresh agents, edit nothing)

| Agent | Reads | Writes (`_review/`) |
|---|---|---|
| `mion-ref-S1..S6` (6) | mion `cases.ts` slice, shared samples, mion `gen/` dumps, audit rows | `ref/mion-S<n>.md`: per case + metric, every check mion runs, and how many errors it reports per invalid sample. Also reviews mion's own entries (type matches the shared suite, options right, no shortcut). |
| `card-<lib>` (4) | `libsrc/<lib>/` + the library's docs | `cards/<lib>.md`: fast check API per metric, compile vs interpret, all-errors vs abort-early, defaults (ajv `coerceTypes`, `useDefaults`, `removeAdditional`, formats `full` mode; zod `z.compile` and what `.validate` skips, circular schemas fall back to the uncompiled parser `zod/cases.ts:15`; typia tags), built-in feature list per type and format, each with `path:line` |
| `harness` (1) | `shared/harness/*`, `aggregate.mjs`, `benchAggregate.ts` | `harness.md`: same loop, samples, warmup for all; one shared call site in `benchOps` (`measure.ts:33-42`) may slow later cases by run order: measure whether it skews a library, fix only if proven |
| `side-benches` (1) | `typecost/typecost.mjs`, `compiletime/compiletime.mjs`, `_lib/extract-cases.mjs`, `competitors/mion/schemaCases.ts` | `side.md`: entries extracted per library BEFORE (counts), the dropped ones, and whether `schemaCases.ts` builders match the type form (e.g. `TF.bigInt()` vs `bigint`, `schemaCases.ts:19`) |

### Step 2. Wave 2, review (24 fresh agents = 4 libraries x 6 slices, 6 to 8 at a time, edit nothing)

Each reviewer gets: RULES.md, `ref/mion-S<n>.md`, `cards/<lib>.md`, its `cases.ts` slice (by the
`// ── GROUP ──` markers; DATETIME and JSON_SCHEMA appear in TWO sections each, both named), the shared
samples, its `gen/` dumps, its audit rows, library source on demand. Writes `_review/findings/<lib>-S<n>.md`.

Slices (balanced by effort, sum 272):

| Slice | Groups | Cases |
|---|---|---|
| S1 | ATOMIC, ARRAY, NATIVE | 42 |
| S2 | OBJECT, STRICT | 36 |
| S3 | UTILITY, REALWORLD, TYPE_MAPPINGS | 30 |
| S4 | UNION, TUPLE, TEMPLATE_LITERAL | 40 |
| S5 | CIRCULAR, CIRCULAR_REFS, JSON_SCHEMA, both DATETIME sections | 59 |
| S6 | STRING_FORMAT, NUMBER_FORMAT, BIGINT_FORMAT | 65 |

Why this split: the library card holds the library knowledge, so no reviewer re-reads the whole library;
one slice keeps each context small; overrides (S2, S4) and reopened opt-outs (S5) get smaller slices.

### Step 3. Triage + fix

- Coordinator reads all findings, drops weak ones (no evidence), settles conflicts against the mion sheet.
- One fixer agent per `competitors/<lib>/cases.ts` (never two agents on one file). mion files
  (`cases.ts`, `schemaCases.ts`) are fixed by the coordinator.
- After each file: `pnpm miondevx bench typecheck`, then
  `MION_VALIDATION_BENCH_NO_TIMING=1 pnpm miondevx bench --one <lib>`, and the typecost entry counts from
  `side.md` must not drop (typecheck does not catch a dropped extraction).
- Final cross-file consistency pass (one fresh agent over all five files): the same divergence is handled
  the same way in every library. Fixes go back through the per-file fixers.

### Step 4. Side benches (code)

- `_lib/extract-cases.mjs` + `typecost/typecost.mjs`: extract typia `createEquals` too, so STRICT counts.
- `compiletime/compiletime.mjs`: build both libraries over the SAME cases (the ones both support), keep
  each call's options (`{checkUnknowns}`, `{rejectCircularRefs}`), fail on a non-zero exit code.
- Fix the stale counts the review found (`ajv/cases.ts:30` says 263 keys; README says mion has 3
  `NOT_SUPPORTED`, it has 9).

### Step 5. Fair overall score (code)

New rule in `container/website/app/utils/benchAggregate.ts`, every aggregate row, every metric:

- Basis = every case at least one library supports (not the common set).
- A library that does not support a case, or fails it, scores that case at the WORST result among the
  libraries that do: lowest ops for speed, highest count for typecost.
- A case no library supports drops out.

Effect: a case only mion runs gives every library mion's own number, so it never lowers mion. A library
that skips a case is never rewarded for it. Ties on single-library cases pull ratios a bit toward 1;
accepted.

- Replace `commonBasis` and the per-library typecost branch in `aggregateRows` with one helper that builds
  the filled-in values. `HomeBenchTable.vue` (calls `commonBasis` + `geomeanOver` directly) switches to it.
- `repo-contracts.test.ts:1681` (math in one place): update its function-name list.
- `scripts/website/bench-data/pr-report.mjs` `groupRank` ranks only libraries supporting every mion case:
  move it to the same rule, reusing the helper. `aggregate.mjs` has no averages, unchanged.

### Step 6. Re-run

Full `pnpm miondevx bench` (exits non-zero on any fail), `pnpm miondevx bench audit`,
`pnpm miondevx bench typecost`, `pnpm miondevx bench compiletime`, then `pnpm miondevx bench --website`.
Website builds the case bodies onto the pages verbatim (`gen-docs.mjs` `extractCaseSources`), so check
one rendered page with the website-browser skill.

## How to compare (RULES.md, the reviewer brief)

mion is the reference. For every case and both metrics:

1. **Same answer.** Same accepted and rejected values as mion on the shared samples.
2. **Same work.** The same checks mion runs, no more, no less: types, unknown keys (outside STRICT ignore
   them, never reject, strip or copy), NaN / Infinity, Invalid Date, format rules, cycle detection.
   Confirm by reading the library SOURCE that the called path does exactly these checks.
3. **Real features.** Use the library's dedicated feature when it has one (`z.email()`, not a regex
   refine). Custom hooks (`z.custom`, `.refine`, `Type.Refine`, ajv custom keyword, typia custom tag) are
   allowed when no dedicated feature fits, as long as rule 2 holds. Limits: put the hook at the leaf that
   needs it, never one whole-value hook that re-implements the validator; a zod refine must see the input,
   not the parsed copy (`zod/cases.ts:5-13`).
4. **Best real path.** The API a speed-minded user would pick, compiled once in the builder (`z.compile`,
   TypeBox `Compile`, `ajv.compile`, typia `createIs` / `createEquals` for STRICT). Only the returned
   function is timed. No work per call beyond turning the result into a boolean. No cache keyed on the
   input, no state carried between calls.
5. **Errors metric.** `buildErrors` collects ALL errors, as mion does (ajv `allErrors: true`, TypeBox
   `.Errors`, zod `safeParse`, typia `createValidate`). Confirm in source nothing stops at the first
   error; spot-check the error count per invalid sample against the mion sheet. Running the cheap check
   first is fine only if the library itself does it.
6. **Options.** ajv `strict: true` unless a per-case reason; `coerceTypes`, `useDefaults`,
   `removeAdditional` off. Any non-default option needs a one-line reason.
7. **No feature, no case.** No dedicated feature and no custom hook can do the same work →
   `NOT_SUPPORTED` + one-line reason. A `NOT_SUPPORTED` the library CAN do is a bug.
8. **Overrides.** Keep a `SampleOverride` only when it swaps values the library treats differently by
   design AND the kept values are as hard to check as mion's: same count, size, depth, same valid /
   invalid mix, and it never moves or drops the sample that fails late. Otherwise fix or `NOT_SUPPORTED`.
9. **Evidence.** Every claim cites library source `path:line`, or a `gen/` dump line, or `cases.ts:line`.

Findings format, one block per finding (cases with no finding listed once as `ok`):

```md
### <CASE.key> · <validate | validationErrors>
verdict: wrong-api | less-work | extra-work | wrong-answer | bad-override | bad-option | should-be-not-supported | wrongly-not-supported
evidence: <library path:line> + <cases.ts:line>
fix: <the exact new entry, or NOT_SUPPORTED + reason>
```

## Tests

- New `packages/devtools/test/bench-aggregate.test.ts`, importing the website util directly like
  `packages/devtools/test/mion-bench-wire.test.ts:18`: a case only one library runs leaves every ratio
  unchanged; a missing case takes the worst value (lowest ops, highest count); a case nobody runs drops
  out; `fail` counts as missing; Overall and section rows use the same rule.
- `pr-report.mjs` rank change: extend its existing test if one exists, else cover it in the same file.
- Bench conformance: `pnpm miondevx bench typecheck` + full `pnpm miondevx bench` green; typecost and
  compiletime entry counts per library reported before and after.

## Docs

- `container/benchmarks/README.md`: new section "Fair comparison rules" (the 9 rules, short), plus the
  compiletime and typecost basis notes; fix the stale counts.
- `docs/cross-library-validation-alignment-report.md`: update entries whose override or
  `NOT_SUPPORTED` changed.
- Website `container/website/content/03.benchmarks/03.runtypes/`: the intro sentence of `01.is-valid.md`,
  `02.is-valid-formats.md`, `03.get-errors.md`, `04.get-errors-formats.md` ("geometric mean over the cases
  ... every library supports") becomes the worst-result rule; `07.type-checking.md` gets the same sentence.
  `05.json-round-trip.md` is mion-only strategies, unchanged.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- Server (RPC framework) benchmarks, mion-only serialization and transform-wire benches.
- New competitors or new cases.
- Changing mion itself to win a case.

## Done when

- Every case of every library has a verdict; every finding is fixed or rejected with a reason.
- Full `pnpm miondevx bench`, `bench typecheck`, `bench audit`, `bench typecost`, `bench compiletime` pass;
  typia STRICT shows in typecost and compiletime; compiletime compares the same cases.
- Overall scores use the worst-result rule on the pages and the home card, with tests.
- `container/benchmarks/_review/` deleted in the last commit; the PR diff holds only benchmark case and
  logic changes plus their docs.
- README rules section, alignment report and website intros updated.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
