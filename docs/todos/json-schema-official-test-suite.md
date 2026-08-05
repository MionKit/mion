---
type: feature
spec: full-plan
status: ready
created: 2026-08-05
---

# Run the official JSON Schema Test Suite as a conformance lane

## Problem

Our JSON Schema door (`runTypeFromJsonSchema` /
[fromJsonSchema.ts](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts))
is currently measured against a hand-authored 65-case corpus
([container/benchmarks/shared/cases/json-schema-spec/](../../container/benchmarks/shared/cases/json-schema-spec/index.ts),
`pnpm rtx bench spec`). That corpus is one case per keyword; the official
[JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite)
is the real conformance bar: at pinned commit `cc73f5fa` the draft 2020-12
required set alone is **46 files / 383 schema groups / 1299 cases**, plus
`optional/format/` (**21 files / 28 groups / 720 cases**), which matters to us
because our door enforces formats.

This spec adds a repeatable pipeline that vendors the suite at a pinned
revision, generates strongly typed `as const` call sites from it, runs the
whole thing as a Vitest lane, and reports conformance. **Scope is implement +
run + report only: no conformance fixes ride this change.** Divergences land in
a committed ledger (extending the flow started by
[json-schema-spec-conformance-gaps.md](json-schema-spec-conformance-gaps.md));
fixing them is later, separate work.

## Sourcing: pinned-commit vendoring, not npm, not a submodule

- The npm packages are dead ends: `@json-schema-org/tests` (2.0.0) and
  `json-schema-test-suite` (0.0.10) were both last published in 2022 against
  ancient suite snapshots, and the suite repo's own `package.json` is an
  unpublished `0.1.0`. Nothing current exists to install.
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml) sets
  `allowNonRegistryProtocols: false`, so a `github:` dependency is blocked by
  policy anyway.
- A submodule is rejected per the request (and adds bootstrap friction).

So: a fetch script shallow-clones the suite repo at the commit pinned in a lock
manifest and copies the JSON subset we consume into the repo (with the suite's
MIT LICENSE alongside). Upgrading the suite = bump the SHA in the lock, re-run
fetch + triage + generate, review the diff.

## Why codegen (`as const`) instead of importing the JSON

TypeScript widens JSON imports (`"foo"` becomes `string`), and the resolver
reads the **literal type** of the schema argument at each
`runTypeFromJsonSchema(...)` call site (see the idempotency tests in
[jsonSchemaDefine.test.ts](../../packages/ts-runtypes/test/suites/json-schema-define/jsonSchemaDefine.test.ts)).
A runtime loop over parsed JSON therefore cannot exercise the door at all: each
schema group needs its own statically visible call site over an `as const`
schema const. That is exactly what the generator emits.

## Layout

New self-contained test area `packages/ts-runtypes/test/json-schema-official/`
(its own Vitest project, like `test/playground/`):

```
suite.lock.json           pinned source: {repo, commit, fetchedAt, subsets}
vendor/                   raw suite JSON at the pin + its LICENSE (committed)
  draft2020-12/*.json     required set (refRemote.json excluded at fetch)
  draft2020-12/optional/format/*.json
triage.json               committed group partition (see Triage)
quarantine.json           hand-maintained escape hatch (see Contingencies)
known-divergences.json    committed two-way verdict ledger
CONFORMANCE.md            committed per-file summary report
generated/                committed generated TS modules + index barrel
harness.ts                group/case runner helpers + result collection
official.test.ts          the driver
markerPairing.test.ts     CLAUDE.md marker-rule paired getRunTypeId test
generator.test.ts         codegen determinism pin (golden fixture)
vitest.config.ts          own project; plugin config mirrors the marker project
tsconfig.suite-official.json
README.md
```

One script owns the pipeline: `scripts/core/gen-json-schema-suite.mjs` with
subcommands `fetch` / `triage` / `generate` / `report`, exporting its functions
so `generator.test.ts` can unit-test them.

## Plan

### 1. fetch (network; upgrade-time only)

`node scripts/core/gen-json-schema-suite.mjs fetch` reads `suite.lock.json`,
shallow-fetches `json-schema-org/JSON-Schema-Test-Suite` at the pinned commit
(`git init` + `fetch --depth 1 <sha>` into a temp dir), and copies the subsets
listed in the lock into `vendor/`, plus the LICENSE. `refRemote.json` is
excluded here (wholly remote-dependent). Everything downstream is offline.

### 2. triage (offline)

For each vendored group (keyed `file :: group description`, stable across
upgrades), classify into committed `triage.json`:

- `remote` — schema mentions `localhost:1234` (26 groups in the required set).
- `proto-literal` — schema/properties contain a `__proto__` key (one group
  each in `properties.json` and `required.json`): a `__proto__` key in an
  emitted object literal would set the prototype instead of a property, so
  these can never be generated as literals.
- `unsupported-input` — the one-call-site probe snippet fails to type-check
  against the real `ExactJsonSchema` guard. Reuse the snippet-compiler pattern
  from [compileHarness.ts](../../packages/ts-runtypes/test/types/compileHarness.ts)
  (`makeMeasurer` already compiles snippets against the real source tree and
  reports errors); batch the probes into few programs so a full triage stays in
  minutes. Records the first type error as the reason. Expected bulk:
  `$vocabulary`, cross-document `$ref`, `$dynamicRef` beyond the single-resource
  subset, `unevaluated*` shapes the guide documents as build-rejected.
- `ok` — everything else; these get real call sites.

### 3. generate (offline)

One module per suite file under `generated/draft2020-12/` (and
`generated/draft2020-12/optional-format/`), plus an index barrel. Per `ok`
group:

```ts
const s_012 = {type: 'object', properties: {…}} as const;
groups.push(officialGroup('allOf.json', 'allOf with base schema', s_012,
  () => createValidateFn(runTypeFromJsonSchema(s_012)),
  [{description: 'valid case', data: …, valid: true}, …]));
```

Non-`ok` groups are emitted as data-only `skippedGroup(file, description,
reason, caseCount)` records so the report can still count them. Values are
emitted with a deterministic JSON-to-TS printer (sorted nothing — suite order
preserved; keys quoted as needed). Every generated file carries a header naming
the source repo, the pinned SHA, and the MIT license.

Wire it as an rtx codegen target: `pnpm rtx core codegen jsonschema [--check]`
runs triage + generate with the existing drift gate in
[scripts/rt.mjs](../../scripts/rt.mjs) (`fetch` deliberately stays out of
`codegen all` — it needs network).

### 4. run (the Vitest lane)

`official.test.ts` walks the barrel; per group it lazily builds the validator
inside try/catch:

- Construction (or first call) throws → the group's result is
  `build-rejected(<message>)` — this is how resolver-diagnostic entries surface
  under `failOnError: false` (the same escape hatch the marker project already
  uses in [vitest.config.ts](../../packages/ts-runtypes/vitest.config.ts)),
  e.g. the known MKR009 halt on bare-constraint combinator branches.
- Otherwise each case runs and its boolean verdict is compared with the suite
  label, **two-way pinned** against `known-divergences.json`: a divergence not
  in the ledger fails the lane (regression), and a ledger entry that now
  conforms also fails (stale ledger). Ledger entries carry
  `{file, group, case, observed, byDesign, note}` — `byDesign: true` marks
  intentional policy differences (chiefly required-set `format.json`, whose 133
  cases expect annotation-only formats while we enforce them; also the
  NaN/Infinity and content-keyword stances already documented on the bench
  corpus) so the report separates policy from bugs.

The lane is green on day one by construction (the initial ledger records
reality), CI-stable, and honest: any behavior change in either direction turns
it red.

Project wiring:

- Register `packages/ts-runtypes/test/json-schema-official/vitest.config.ts`
  in the root [vitest.config.ts](../../vitest.config.ts) projects list.
- Exclude `test/json-schema-official/**` from the marker project's `include`
  (same pattern as `test/playground/**`).
- Give the project its own `tsconfig.suite-official.json` (src + this dir) and
  add `test/json-schema-official` to
  [tsconfig.test.json](../../packages/ts-runtypes/tsconfig.test.json)'s
  `exclude`, so the fast lanes' resolver Program never pays for the ~250+
  heavy `FromJsonSchema` call sites; chain the new tsconfig into the package's
  `typecheck:test`.

### 5. report

The driver collects results and writes a `results.json` artifact (gitignored);
`gen-json-schema-suite.mjs report` renders it into the committed
`CONFORMANCE.md`: per suite file, counts of conforming / divergent (by-design
vs unexplained) / build-rejected / unsupported-input / proto-literal / remote.
Regenerated whenever the ledger changes.

## Tests

- The lane itself (383 + 28 groups' worth of cases, minus skips) is the bulk.
- `markerPairing.test.ts`: per the CLAUDE.md marker rule, paired static
  `getRunTypeId<FromJsonSchema<typeof S>>()` and reflection
  `getRunTypeId(value)` forms over one representative suite schema, with the
  hash-equivalence assertion (mirror the shape in
  [jsonSchemaDefine.test.ts](../../packages/ts-runtypes/test/suites/json-schema-define/jsonSchemaDefine.test.ts)).
- `generator.test.ts`: run triage + generate over a small in-repo fixture
  (an `ok`, a `remote`, a `proto-literal`, and an `unsupported-input` group)
  and pin the emitted output as a golden snapshot — codegen determinism and the
  partition logic in one test, no network.
- Go side untouched: no `go -C ts-go-runtypes test` additions needed.

## Docs

- `README.md` in the suite dir: the pipeline, the taxonomy, how to upgrade the
  pin, how to read `CONFORMANCE.md`.
- One paragraph in [docs/ARCHITECTURE.md](../ARCHITECTURE.md) where the
  json-schema door is described, pointing at the lane.
- Website: none — this is contributor-facing test infrastructure, which
  CLAUDE.md keeps off the consumer docs.
- Cross-reference: extend
  [json-schema-spec-conformance-gaps.md](json-schema-spec-conformance-gaps.md)
  with a pointer to the ledger once the first run lands (its four gaps should
  reappear there as non-`byDesign` entries).

## Fuzzing

Not a fuzzing candidate: the suite is itself a fixed oracle corpus. The
existing fuzz lanes already cover generative schema input.

## Out of scope

- Fixing any divergence, build rejection, or unsupported keyword (ledger only).
- Drafts other than 2020-12 (`draft4`–`draft2019-09`, `latest`, `v1`), the
  `remotes/` tree and `refRemote.json`, `optional/` beyond `format/`, and the
  suite's `output-tests/`.
- The bench spec corpus and `pnpm rtx bench spec` page: untouched.
- Any change to the door itself
  ([fromJsonSchema.ts](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts)
  and friends).

## Contingencies

- **A group hard-halts a whole module's transform** despite
  `failOnError: false`: move it into hand-maintained `quarantine.json`
  (consumed by generate like a triage verdict, reason `transform-halt`); the
  generator test keeps the file's schema honest. Expect few of these; MKR009's
  known shape suggests they exist.
- **Lane wall-clock blows up** (~250+ call sites through the resolver): the
  per-suite-file module split already shards the transform; if still slow, the
  project stays out of default `pnpm test` behind its own script — decide on
  measured numbers, default is in.
- **Triage probe cost**: batch snippets into few `makeMeasurer` programs;
  triage runs only at upgrade time regardless.

## Done when

- `node scripts/core/gen-json-schema-suite.mjs fetch` reproduces `vendor/`
  byte-identically at the pinned SHA, and re-pinning to a newer suite commit
  changes only `vendor/`, `triage.json`, `generated/`, ledgers and report.
- `pnpm rtx core codegen jsonschema --check` passes offline and gates drift.
- The lane runs in `pnpm test` (or its documented own script if measurement
  says so) and is green: every non-skipped case either conforms or matches a
  ledger entry, both directions enforced.
- `CONFORMANCE.md` is committed with real per-file numbers; the four known
  gaps show up as non-`byDesign` ledger entries cross-referenced from
  [json-schema-spec-conformance-gaps.md](json-schema-spec-conformance-gaps.md).
- `markerPairing.test.ts` and `generator.test.ts` pass; `pnpm run lint`,
  `pnpm run format` and the typecheck chain stay green.
