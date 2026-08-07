---
type: feature
spec: full-plan
status: done
created: 2026-07-29
---

# JSON Schema first-class input — rollout: docs, examples, playground, benchmarks, e2e

**Process-level plan** — code-level design is the implementing agent's job. **Blocked on:** [json-schema-first-class-implementation.md](../done/json-schema-first-class-implementation.md) shipping first — examples typecheck against built dist `.d.ts`, benchmarks and e2e consume the published surface. Companion investigation: [docs/investigations/json-schema/](../investigations/json-schema/).

## Intent

Make the shipped feature adoptable and honest: user docs with compiled examples, playground presence, benchmark evidence (including the two marquee comparisons: same-schema runtime validation vs AJV, and `FromJsonSchema` type-cost vs json-schema-to-ts), and packed-tarball e2e proof across all six bundlers.

## Ground rules (fixed)

1. Website style per CLAUDE.md → Website Documentation: reader-first voice, no dash punctuation, `<code-import>` over hand-written fences, MDC machine-owned bits untouched, short frontmatter descriptions. No hand-written performance numbers (link or `::bench-table`), no hand diagnostic tables, no hand TS fences.
2. Package READMEs untouched — pinned thin by `repo-contracts.test.ts` (≤45 lines, no tables, website link). The root README may gain a one-liner.
3. Benchmark totality is structural: new shared case keys widen `CaseKey`, and every competitor map fails to compile until each key is filled or marked `NOT_SUPPORTED, // one-line reason`.
4. Image pushes: ONLY dependency changes need one (`container/benchmarks/_deps/**` ⇒ push the website image; e2e `_deps`/`registry` ⇒ push the e2e image). Cases, fixtures, and prose are bind-mounted — no push.
5. Gates per milestone: `container/website/scripts/check-links.ts`, `check-unused-examples.ts`, `pnpm rtx website check --static`, root `typecheck` (examples), full `pnpm test`.

## R1 — examples + website docs

- `packages/examples/tsconfig.json` `paths` gains the new subpath → dist `.d.ts` entry (nothing compiles before this — the map currently lists only `.`, `/formats`, `/schema`, devtools).
- New examples `packages/examples/src/guide/json-schema-*.ts` (repo naming convention `<page-topic>-<variant>`), marker-delimited (`commentStart`/`commentEnd`) for tabs: basics, formats, convergence-with-type-first, factory usage, utility composition.
- New guide page inserted as `container/website/content/2.guide/2.json-schema.md` WITH renumbering of the current `2.`–`9.` pages (check-links catches inbound `/guide/...` breakage; the append-as-`10.` alternative was considered and rejected — a headline feature ordered after "linting" is wrong).
- Amend `2.guide/5.validation.md` §"Three ways to call any factory" to four; same touch on `4.serialization.md`; `1.types-vs-schemas.md` gains the third-form cross-link.
- `index.md` is NOT touched without explicit owner approval at implementation time (hand-tuned page; flag it, do not edit it).

## R2 — playground preset

- Add a "JSON Schema" `Preset` in `container/website/app/playground/presets.ts`: `ts` = the equivalent type-first source, `schema` = the `jsonSchema({...})` form. It rides the EXISTING `'schema'` mode (`<factory>(MyType)` call template; `pickFactorySite` already tolerates a builder's own reflection site), so zero engine change is expected; the WASM source overlay auto-includes new `packages/ts-runtypes/src` subpaths (`scripts/website/playground-overlay.mjs`).
- Widening `Preset`/`Mode` to show three forms simultaneously is an optional stretch, implementer's call — not a gate.
- Gate: the `packages/ts-runtypes/test/playground` engine suite green with the new preset.

## R3 — benchmarks (three lanes)

**(a) Runtime validation lane — same-schema vs AJV.** New shared case group under `container/benchmarks/shared/cases/` whose cases carry the schema literal itself (schema literals are library-free data, satisfying the no-imports rule). `CaseKey` widens ⇒ fill all five competitor maps: ts-runtypes drives its factories from `jsonSchema(schema)`; **ajv compiles the SAME literal** (+ ajv-formats where the case uses formats) — the apples-to-apples headline; typebox uses its JSON-Schema-native form where the subset allows; zod/typia are `NOT_SUPPORTED, // no JSON Schema input` unless an existing pin trivially converts (implementer verifies; no new deps without cause). Also fill `competitors/ts-runtypes/schemaCases.ts` (the second total map). A new suite name ripples: `SuiteName` + `collect()` in `shared/cases/index.ts`, a bench-slug mapping in `gen-docs.mjs`, and a new `content/7.benchmarks/` page carrying `::bench-table` (check-static enforces it).

**(b) Typecost forms.** Two additions to the forms machinery (`container/benchmarks/_lib/extract-cases.mjs` extractor + probe dir in `typecost/typecost.mjs` + `TYPECOST_FORMS` row in `scripts/website/bench-data/gen-docs.mjs`): a "ts-go (jsonSchema)" form (measures `FromJsonSchema` instantiation cost) and a "json-schema-to-ts" form (the type-level competitor; NEW dependency under `container/benchmarks/_deps/` ⇒ Containerfile install layer + **website image push** — the one push this todo requires). AJV keeps no typecost form (no static inference) — that asymmetry IS the story the page tells.

**(c) Serialization columns + correctness.** `scripts/website/bench-data/gen-serialization.mjs`: new `ROUNDTRIPS` + `SOURCE_FIELDS` entries for the `jsonSchema*` thunks the implementation todo adds (new cases/groups flow automatically; new thunk COLUMNS are generator work). Correctness/alignment lane: extend the existing correctness machinery with the AJV-parity check from [04-migration-plan.md](../investigations/json-schema/04-migration-plan.md) — `createMockDataFn` values must agree with AJV compiled from the same schema (valid mocks pass, `{invalid: true}` mocks fail).

## R4 — pre-publish e2e

- New family file `container/pre-publish-e2e/apps/shared/src/json-schema.ts` (`checkJsonSchema(): CheckResult[]` exercising the subpath end-to-end), registered in `apps/shared/src/index.ts` (`export *` block + `FAMILIES` array), and the `families === 13` assertion in `test/build-outputs.test.mjs` bumped.
- One `@ts-runtypes/core/json-schema` import added to `apps/shared/src/minimal.ts` so ALL SIX bundler smokes prove packed-tarball subpath-export resolution (do not repeat the existing `formats/temporal` under-coverage gap).
- `test/rewrite-evidence.test.mjs`: extend the evidence checks for jsonSchema sites (builder-form trailing-arg injection — the existing residual-generic regex does not cover it).
- Optional: one jsonSchema convergence line in `host-smoke` (it already asserts both `getRunTypeId` shapes).
- No `_deps` change ⇒ no e2e image push. The verdaccio publish + receipt flow is untouched.

## R5 — docs housekeeping

- `docs/ARCHITECTURE.md`: the "two ways to describe a type" paragraph (§ts-runtypes) becomes three.
- `docs/ROADMAP.md`: a JSON Schema entry, AND reconcile the value-first "deliberate boundary" sentence (the boundary rejected recursive value-config DSLs; the schema form is admitted as an interop standard, not a bespoke DSL — the prose must draw that line explicitly).
- Closing note in `docs/investigations/json-schema/` pointing at the shipped state; the todos move to `docs/done/` per the implement-todo flow.

## Out of scope

New product features or keywords; Go-side changes; the OUTPUT direction (`createJsonSchemaFn`) and its benches; a transform-wire schema-density sweep (stretch; not website-wired anyway); marketing copy beyond the root-README line; `index.md` edits (flagged, owner-approved separately).

## Done when

- Guide page + amended pages live; all examples compile via root `typecheck`; check-links / check-unused-examples / check-static green.
- Playground preset present; engine suite green.
- Bench lanes render on the website with real data (the new validation page + both new typecost rows); website image pushed after the `_deps` addition; competitor maps total (compilation is the proof).
- E2e: six bundler smokes + the heavy app import the subpath, the families count is bumped, rewrite evidence extended, receipt flow green end-to-end.
- ARCHITECTURE/ROADMAP amended. Full `pnpm test` + `pnpm run lint` green.

## Shipped (reconciliation, 2026-07-30)

All five rollouts landed on `feature/json-schema-rollout`. Four of this spec's own assumptions turned out to be wrong; those, and every other deviation, are recorded below.

> **Naming note (2026-07-31).** The builder is now `runTypeFromJsonSchema`, not `jsonSchema`; every `jsonSchema(…)` spelling in this document predates the rename. It landed on this same branch, before the subpath ever reached npm, and it touched every surface this spec produced (examples, guide page, playground preset, benchmark maps, e2e apps). Reasoning and the list of things that deliberately kept the old spelling: [json-schema-first-class-implementation.md → Renamed after the fact](json-schema-first-class-implementation.md#renamed-after-the-fact-jsonschema--runtypefromjsonschema-2026-07-31).

### Corrected assumptions

- **`check-links.ts` does NOT catch inbound `/guide/...` breakage** (R1, line 28). It only validates `<code-import path=…>` targets. Renumbering was safe regardless: Nuxt strips the numeric prefix, so slugs are unchanged and all 62 internal links still resolve (verified explicitly, since no gate does).
- **`4.serialization.md` has no "Three ways to call any factory" section** to amend (R1, line 29). The only "three call forms" prose in the whole content tree is in `5.validation.md` (now `6.`), at two spots, and both became four. Nothing on the serialization page was false, so it was left alone rather than growing a manufactured section.
- **The playground overlay does NOT auto-include new subpaths** (R2, line 34). `scripts/website/playground-overlay.mjs` auto-walks the FILES but hardcodes the virtual `exports` map, and an exports map is exhaustive, so the subpath was blocked. Fixed with the missing key, and pinned by a new drift test that compares the overlay's map against the real `package.json` — the same trap would otherwise catch the next subpath.
- **The playground engine suite does not gate presets** (R2, line 36). It never imports `PRESETS`, and it self-skips entirely without `.cache/rt-wasm/`, so "engine suite green with the new preset" proved nothing. A dedicated `test/playground/jsonSchema.test.ts` was added instead: overlay + preset contracts (resolver-free) plus four live-WASM tests, including id convergence between the type-first and jsonSchema forms.

### R1 — examples + docs

Five guide examples (`json-schema-{basics,formats,convergence,factories,composition}.ts`) plus `_homepage/define-json-schema.ts` and a third marker region in `types-vs-schemas-side-by-side.ts`; `packages/examples/tsconfig.json` gained the subpath path entry. New `2.guide/2.json-schema.md`, with `2.`–`9.` renumbered up one. `1.types-vs-schemas.md` gained a full third COLUMN (not just the planned cross-link) since it is the page named for the comparison. `validation-three-forms.ts` was renamed `validation-call-forms.ts` — four forms now.

**`index.md`: owner-approved during implementation** and given the third column. `.rt-define-cols` is shared by four pages, so the grid change rides an opt-in `rt-define-cols-3` modifier in `mion.css` rather than widening the base class.

### R3 — what the benchmark lane actually found

- **TypeBox has NO runtime JSON Schema input door** — the spec expected "its JSON-Schema-native form where the subset allows". `TypeCompiler` dispatches on TypeBox's own `[Kind]` symbol, which a plain document lacks, and `Type.Unsafe()` only overrides the static side (its compiled check is a no-op). The whole column is `NOT_SUPPORTED` with that reason. So the lane's filled columns are ts-runtypes and ajv only, which IS the marquee comparison this spec asked for.
- **The ajv column needs `ajv/dist/2020`.** The default `Ajv` export is draft-07 and would silently ignore `prefixItems` while reading `items: false` with draft-07 semantics.
- **`prefixItems` alone does not require members** (JSON Schema semantics; `FromJsonSchema` models this correctly, all members optional below `minItems`). The `tuple_pair` case carries `minItems: 2` so its title is true and its samples are right. Caught by inspecting `createMockDataFn` output, which was emitting holes.
- **`jsonSchemaCases.ts` is lane-scoped, not a third TOTAL map.** It feeds typecost only, and the question it answers ("what does recovering a type from a document cost") is only meaningful where a document exists. Same for the `json-schema-to-ts` map.
- **`json-schema-to-ts` needed a new extractor.** It ships `FromSchema<S>` and no runtime at all, so neither existing extractor shape fits; `extractSchemaDocs` reads a bare document map. Its typecost form degrades to n/a when the dep is absent from the image, rather than erroring per case.
- **Serialization gained TWO columns**, not one: `jsonSchema` and `jsonSchema binary`, since the implementation added four thunks.
- **AJV parity needed no new machinery.** The `createMockDataFn`-vs-AJV check the spec wanted is delivered by putting mock snapshots into the shared `valid` samples: the existing alignment audit already runs every competitor over those samples, so any RunTypes/AJV disagreement lands on the existing correctness page. A standalone runner was considered and rejected (the audit runs inside each competitor's own bundle, so a cross-library runner has no home there). The samples must encode OUR semantics for this to work at all, including where we knowingly differ — see the parity note under "Verified" for the correction that point needed.

### R4 — e2e

Family 14 (`json-schema`), `13` → `14` everywhere. `minimal.ts` imports the subpath so all six bundler adapters prove packed-tarball subpath resolution.

**The planned builder-form byte check was tried, failed, and was replaced.** The spec (line 50) asked `rewrite-evidence.test.mjs` to cover builder-form trailing-arg injection, correctly noting the existing `RESIDUAL` regex cannot. A balanced-delimiter scan requiring every `jsonSchema(…)` site to close with an injected `__rt_…` was written, and the e2e run rejected it on all seven apps for two reasons that are not fixable by a better regex:

- **Not every builder call gets its own id.** `RT.partial(jsonSchema(SCHEMA))` folds the inner site into the outer marker, so a bare `jsonSchema(ACCOUNT_SCHEMA)` in the dist is CORRECT output. A byte check cannot distinguish that from a site the plugin skipped.
- **The callee spelling is bundler-specific.** webpack emits the indirect `(0, ns.jsonSchema)(…)` form, so the literal needle found nothing at all in its dist.

Replaced with a check that is sound: the dist must contain the `@ts-runtypes/core/json-schema` specifier. Core and its subpaths are external in every app, so that string is bundler-invariant, and it proves the packed tarball's subpath export resolved — the actual gap R4 set out to close. Builder-form injection is proven behaviourally instead, by `minimal.ts` across all six adapters and the `json-schema` family on build-vite: an un-injected `jsonSchema(…)` cannot yield a working validator, so those assertions fail loudly where a byte scan would have to guess. The test header records why, so the next reader does not re-attempt the byte check.

### Related fixes folded in

- `gen-docs.mjs` `TYPECOST_FORMS`: `srcFile: '@ts-runtypes/core/cases.ts'` resolved to a directory that does not exist, so BOTH ts-runtypes typecost columns were shipping with no hover source, silently. Corrected to `ts-runtypes/…`.
- `competitors/ts-runtypes/schemaCases.ts` is declared total but was missing all three `CIRCULAR_REFS.*` keys. Filled.
- `build-all.mjs`'s "the six apps" comment listed seven.

### Verified

| Gate | Result |
| --- | --- |
| JS suite (`vitest`, fuzz excluded) | 224 files, 9762 tests, 0 failures |
| `pnpm run typecheck` (incl. the new examples) | exit 0 |
| `oxlint` | clean |
| playground project | 43/43, including the live-WASM id convergence test |
| bench: ts-runtypes | 276 cases, 0 fail, 0 errored — all 10 JSON_SCHEMA green on both metrics |
| bench: ajv | 276 cases, 0 fail, 0 errored — all 10 JSON_SCHEMA green |
| **AJV parity** | 10 JSON_SCHEMA misalignment records, all ajv, all one root cause (below); ts-runtypes itself 0 over 3966 sample checks |
| typecost `ts-runtypes (jsonSchema)` | 10 rows, 9705 net instantiations total |
| serialization | both `jsonSchema` columns populated, 144/144 cases |
| website prerender | 33 content files parsed, zero code-import errors, `/guide/json-schema` + `/benchmarks/json-schema` rendered |
| `rtx website check --static` | **PASS**, 9 benchmark pages (was 8); the new page renders 10/10 cases with hover detail |

**The parity row took a correction worth recording, because the first version of it was hollow.** The lane initially reported ZERO ajv misalignments, which was presented as "the two agree everywhere". It was really an artifact of sample selection: the samples never put NaN or Infinity in a bare `number` position, and one known divergence had been deliberately *removed* from the fixtures on the reasoning that "the disagreement belongs on the correctness page, not in a speed lane". That reasoning is backwards. The shared samples ARE the input to the correctness audit, so excluding a disagreement is precisely what stops it being reported. The established pattern (`ATOMIC.number`, `UNION.atomic_union`) is the opposite: the disagreeing value goes in the shared list, and the competitor opts its TIMING lane out with a `samples` override that `audit.ts` deliberately ignores.

Fixed, and the lane now reports the real picture:

| case | sample | ts-runtypes | ajv |
| --- | --- | --- | --- |
| `union_anyof` | `NaN`, `Infinity`, `-Infinity` | reject | accept |
| `record_number` | `{a: NaN}`, `{a: Infinity}` | reject | accept |

One root cause across both: a bare `{type: 'number'}`, which ajv reads as `typeof === 'number'` and we read as `Number.isFinite`. That is our default `numberMode`, not a schema-translation choice — a caller who wants ajv's reading sets `numberMode: 'typeof'`. Pinned from the RunTypes side by the new "numbers follow OUR semantics" cases in the define suite, which prove a schema-authored `{type:'number'}` resolves to the *same validator object* as `createValidateFn<number>()`.

Two things that LOOK like divergences and are not, both settled by running ajv rather than reading it, and both recorded in the case file so they do not get "fixed" into overrides later: `{type: 'integer'}` rejects NaN/Infinity in ajv too, and `format: 'email'` under `addFormats(ajv, {mode: 'full'})` rejects `missing@tld` exactly as ours does (the permissive regex belongs to ajv-formats' DEFAULT mode, which this lane does not use).

What the parity check genuinely proves, then: over ten documents and every shared sample including the `createMockDataFn` snapshots, the only place the two libraries disagree is the one place we have already decided to disagree, on purpose, with a documented knob to change it. That is a stronger and more honest result than a zero.

Two things the run also settled: `ts-runtypes (type)` correctly contributes NO rows for the JSON_SCHEMA group (the extractor skips a `createValidateFn` call with no type argument, which is exactly right for a builder-form entry), and the `json-schema-to-ts` column is dropped entirely rather than rendering a strip of n/a, because `gen-docs` omits a form with no results file.

### Findings filed, not fixed

- [json-schema-uuid-format-narrows-to-v4.md](../todos/json-schema-uuid-format-narrows-to-v4.md) — `format: 'uuid'` maps to `UUIDv4`, so a valid v1/v6/v7 UUID is rejected by a schema that permits it. Predates this work (shipped with M1).
- [bench-website-e2e-followups.md](../todos/bench-website-e2e-followups.md) — this spec's ground rule 3 ("compilation is the proof") is not true today: nothing in CI runs `tsc` over `container/benchmarks`, which is how the `schemaCases.ts` drift above survived. Needs an in-container check, since the deps never exist on the host.
- [bench-website-e2e-followups.md](../todos/bench-website-e2e-followups.md) — every one of typia's 195 `buildErrors` thunks calls `typia.createValidateFn`, which the pinned typia 13.0.0-dev does not export (it is `createValidate`). 195 errored cases, so both `getvalidationerrors` pages have been shipping with no typia column. Same root cause as the todo above: `tsc` would have caught it instantly.
- [bench-website-e2e-followups.md](../todos/bench-website-e2e-followups.md) — three standing zod divergences make its lane print "FAILED" on every run, so a lane that genuinely breaks is indistinguishable. Observed in the same run: ajv's real build failure printed the identical line.
- [bench-website-e2e-followups.md](../todos/bench-website-e2e-followups.md) — `rtx bench --one <competitor>` crashes in `aggregate.mjs` when audit artifacts are present, because it assumes every `results/*.json` has a `cases` array. Hit while re-running ajv; worked around by invoking `gen-docs.mjs` directly.

### Not done here

**The website image was NOT built or pushed.** This environment's network policy denies Docker Hub's blob CDN (`production.cloudfront.docker.com`, 403 on CONNECT), so the `node:26-bookworm` base image cannot be pulled and `rtx container build-image website` cannot run. GHCR itself works, so the published image was pulled and used for everything else. The `_deps/competitors/json-schema-to-ts` manifest and its Containerfile layer are committed and ready; **`pnpm rtx container push website` still has to run from a host with Docker Hub access**, after which the `json-schema-to-ts` typecost column fills in. Until then it renders n/a by design, and no other lane is affected.
