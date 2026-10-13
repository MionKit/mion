---
type: feature
spec: full-plan
status: ready
created: 2026-10-13
---

# Benchmark the latest validators, add zod's is-valid lane, rename the validation pages

## Problem

The RunTypes validation benchmarks run old competitor versions, so the numbers undersell them:

| Library | Pinned now | Newest found 2026-10-13 |
| --- | --- | --- |
| zod | `4.4.3` | `4.6.7` |
| typebox | `@sinclair/typebox ^0.34.0` | new package `typebox` `1.3.37` (old line ends at `0.34.52`) |
| typia | `13.2.0` | `15.1.0` |
| ajv | `^8.17.0` | `8.20.0` |

zod 4.6 adds two things that matter here:

- `z.compile(schema)`: ahead-of-time compiled fast path, about 2.4x faster on zod's own suite.
- `schema.validate(value)`: a boolean check (type guard). It runs the compiled check and, on failure,
  re-runs with `abortEarly: true`, so it never builds a full `ZodError`. Both exist from `4.6.3` on;
  `4.5.x` has `compile` but no `validate`. (The user called it `z.is`; zod ships it as `validate`.)

Today zod has no `build` entry anywhere, so it is missing from the is-valid pages and shows a "no fast
check" note. `competitors/zod/cases.ts:15-19` says why: "zod has NO cheap boolean validator".

The page names are also unclear. "Validation" vs "Validation Errors" does not tell a reader that one
page is a true/false check and the other returns the list of errors.

## Plan

### 1. Version bumps (`container/benchmarks/_deps/competitors/*/package.json`)

- `_deps/pnpm-workspace.yaml` sets `minimumReleaseAge: 43200` (30 days) and `savePrefix: ''`.
  Pick the newest release older than 30 days on the day you build, pinned exact (no caret).
  On 2026-10-13 that is zod `4.6.3`, typia `14.0.6` (15.x clears the gate on 2026-10-22), ajv `8.20.0`,
  typebox `1.3.30` or older. There are no lockfiles, so caret ranges float on every image rebuild: pin
  every competitor dep exact, ajv and ajv-formats included.
- **zod**: `"zod": "<newest allowed, >= 4.6.3>"`.
- **ajv**: `"ajv": "8.20.0"` and the newest allowed `ajv-formats`, exact.
- **typebox**: replace `@sinclair/typebox` with `typebox` (1.x). New API:
  `import Type from 'typebox'` + `import {Compile} from 'typebox/compile'`, check with `C.Check(v)`,
  errors with `C.Errors(v)`. Rewrite all 199 `build` + 199 `buildErrors` entries in
  `competitors/typebox/cases.ts` (pattern at lines 18-32) and fix any type that moved or was renamed.
  A case that 1.x can no longer express → `NOT_SUPPORTED // <why>`; one it now supports → add it.
- **typia**: newest allowed major. Keep `ttsc` + `@ttsc/unplugin` on a matching version (typia's peer
  range is `ttsc >=0.19.2`). Rebuild the plugin per `competitors/typia/esbuild.config.mjs`, check
  `createIs` / `createValidate` still compile every case.
- Update the version strings that name the old pins:
  - `container/benchmarks/capture-env.mjs:15-35`: `@sinclair/typebox` → `typebox`.
  - `packages/devtools/test/bench-lane-contracts.test.ts:54`: the "typia 13.2.0" note.
  - `container/website/app/utils/benchFormat.ts:61-75`: the `typebox 0.34.49` example in `shortVersion()`.
  - `docs/WEBSITE-DOCGEN.md:117`: example `"zod": "4.4.3"`.

### 2. zod is-valid lane (`container/benchmarks/competitors/zod/cases.ts`)

Every supported case gets both entries, schema compiled once per builder:

```ts
'ATOMIC.string': {
  build: () => {
    const schema = z.compile(z.string());
    return (value: unknown) => schema.validate(value);
  },
  buildErrors: () => {
    const schema = z.compile(z.string());
    return (value: unknown) => schema.safeParse(value).success;
  },
},
```

- `z.compile` on both lanes: the other libraries all run their compiled path (typebox `Compile`,
  ajv `compile`, typia generated code), so zod gets its own.
- `z.compile` silently returns the schema uncompiled for constructs it cannot compile. Note which cases
  fall back (pass `{strict: true}` once locally to list them), keep them, add a one-line comment.
- The 40 `NOT_SUPPORTED` stay as they are.
- Replace the header comment at lines 15-22 and the STRICT note at lines 1928-1930. Fix the stale
  "EXACTLY 263 entries" (the suite has 272).
- `z.custom` / `.refine` / `plainObject` cases: `validate` runs the same checks, so no sample overrides
  should be needed. If one diverges, fix the schema, never add an override to hide it.

### 3. Drop every "zod has no fast check" remark

Each place below assumes zod has no `validate`. Rewrite or delete:

- `container/benchmarks/shared/harness/types.ts:33,37-38`, `runner.ts:10-12`.
- `container/benchmarks/_lib/extract-cases.mjs:139-142`, `typecost/typecost.mjs:31-38`.
- `scripts/website/bench-data/gen-docs.mjs:11-14` and `:514-521` (typecost fallback to the errors source
  "for libraries with no cheap validator (zod)": zod now has a `build`, check the fallback is still needed).
- `app/components/content/RuntypesBenchBars.vue:86-95` (comment naming zod).
- `app/components/content/HomeBenchTable.vue:47-74,149`: zod's `viaErrors` asterisk + footnote "No fast
  is-valid check…" go. If no library uses the fallback any more, delete the fallback too.
- `app/components/content/BenchTable.vue:231-238` comment.
- The two `::note` blocks on the is-valid pages (`01.validation.md:13-15`, `02.validation-formats.md:9-11`).
- `docs/cross-library-validation-alignment-report.md`: line 27 (audit runs `safeParse` only for zod),
  line 109 (`37 NOT_SUPPORTED`, now 40). Re-run the audit and refresh the zod rows.
- `container/benchmarks/README.md:70-81`: the stale zod table ("Coverage (of 263): zod ok=118 …").
  Refresh it from the new run or cut it.
- `packages/run-types/src/builders/TYPE-COST.md:196` ("Measured locally against zod 4.4.3"): re-measure
  on the new version and update the number + version.

### 4. Rename the four pages

In `container/website/content/03.benchmarks/03.runtypes/`. The prefix stays; the slug becomes the new URL.
No redirects for the old URLs (user's call: breaking links is fine).

| Now | New file | New `title` |
| --- | --- | --- |
| `01.validation.md` "Validation" | `01.is-valid.md` | Is Valid |
| `02.validation-formats.md` "Validation Formats" | `02.is-valid-formats.md` | Is Valid Formats |
| `03.getvalidationerrors.md` "Validation Errors" | `03.get-errors.md` | Get Errors |
| `04.getvalidationerrors-formats.md` "Validation Error Formats" | `04.get-errors-formats.md` | Get Errors Formats |

- Rewrite each `description:` to say plainly what is timed: a true/false answer vs the full list of
  errors. Drop the `getValidationErrors` code name from `03`'s description
  (`container/website/AGENTS.md:29`: no code names in a title).
- Point every current link at the new slug. The old slug must leave no trace (root AGENTS.md):
  - `03.runtypes/.navigation.yml:4` (section redirect).
  - `01.introduction/01.mion-benchmarks.md:41,94`.
  - `02.runtypes/01.introduction/01.about-mion-runtypes.md:68,173,338`.
  - In-page links `01.validation.md:14`, `02.validation-formats.md:10` (deleted with the notes anyway).
  - `container/website/public/_redirects:54` (`correctness → validation`): retarget to `is-valid`.
  - `packages/devtools/test/website-links.test.ts:118`: required route → `/benchmarks/runtypes/is-valid`.
  - `docs/WEBSITE-DOCGEN.md:42-46,50-51`: page table + "validation and validation-errors pages" wording.
- Chart labels follow the page names: `scripts/website/bench-data/gen-docs.mjs:427-434`
  (`label: 'Is-valid'` → `'Is valid'`, `'Validation errors'` → `'Get errors'`, matching `metricLabel`),
  and the hard-coded caption at `HomeBenchTable.vue:134`.
- Keep stable (generator ↔ UI boundary, `docs/WEBSITE-DOCGEN.md:102`): dataset names `validation` /
  `validation-formats`, metric keys `validate` / `validationErrors`, `Metric` type in `harness/types.ts:52-53`.

### 5. Regenerate data

`pnpm miondevx bench --website` (needs the bench image rebuilt; the `_deps` hash change triggers it).
The data under `container/website/public/bench-data/` is git-ignored, nothing to commit there.

## Tests

- `pnpm miondevx bench typecheck`: every competitor map stays total over the 272 keys.
- Full bench run, then `node container/benchmarks/aggregate.mjs`: exits non-zero on any `fail` or
  `errored`. zod `validate` must be `ok` on every case it supports, on both valid and invalid samples.
- `MION_AUDIT_ALIGNMENT=1` audit for zod, typebox, typia: no new divergences from the upgrades. A new
  divergence is a real finding: fix the case schema, or record it in the alignment report.
- `packages/devtools/test/bench-lane-contracts.test.ts` (typia pin, lane contracts).
- `packages/devtools/test/website-links.test.ts`: new required route, no dead links, `_redirects` targets live.
- `pnpm miondevx website build` then `scripts/website/check-static.mjs`: each page's `metric=` is in its index,
  bars render. Open the four pages with the website-browser skill: zod now shows on Is Valid + Is Valid Formats.
- Marker API not involved, no `getRunTypeId` pairing needed.

## Docs

Touched pages: the four renamed pages, `01.introduction/01.mion-benchmarks.md`,
`02.runtypes/01.introduction/01.about-mion-runtypes.md`. No new section.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Fuzzing

None: no new runtime behavior in mion, only benchmark lanes and pages. The shared samples + audit are the oracle.

## Out of scope

- The RPC server benchmarks under `container/mion-bench/_deps/*` (they pin `zod ^4.3.6` for the server lanes).
  Separate surface, separate change.
- The mion competitor's `@typescript/native-preview` pin (already deferred elsewhere).
- Renaming dataset names, metric keys or the harness `Metric` type.
- New competitors (valibot, arktype).

## Done when

- zod, typebox (`typebox` 1.x), typia and ajv run the newest release past the 30-day gate, pinned exact.
- zod shows on the Is Valid and Is Valid Formats pages with `ok` on every supported case, through `z.compile` + `validate`.
- No file says zod lacks a fast check; old slugs and old page titles appear nowhere.
- Pages are Is Valid / Is Valid Formats / Get Errors / Get Errors Formats at the new URLs, all links live.
- Bench correctness gate, audit, typecheck, `pnpm run lint`, website link tests and static check pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
