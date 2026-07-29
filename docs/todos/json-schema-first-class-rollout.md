---
type: feature
spec: full-plan
status: blocked
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
