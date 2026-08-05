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

This spec adds a repeatable pipeline that installs the suite as a
commit-pinned dependency, generates strongly typed `as const` call sites from
it, runs the whole thing as a Vitest lane, and reports conformance. **Scope is implement +
run + report only: no conformance fixes ride this change.** Divergences land in
a committed ledger (extending the flow started by
[json-schema-spec-conformance-gaps.md](json-schema-spec-conformance-gaps.md));
fixing them is later, separate work.

## Sourcing: a commit-pinned git devDependency, no vendored files

The suite is NOT consumable from the npm registry: `@json-schema-org/tests`
(2.0.0) and `json-schema-test-suite` (0.0.10) were both last published in 2022
against ancient suite snapshots, and the suite repo's own `package.json` is an
unpublished `0.1.0`. A submodule is rejected per the request. Instead the
suite rides as a root-level devDependency pinned to a FULL commit SHA:

```json
"json-schema-test-suite": "github:json-schema-org/JSON-Schema-Test-Suite#cc73f5fa64c3b0d11f6c277db4edc22938994b54"
```

Verified empirically under the repo's exact pnpm (11.8.0):

- **No policy exception is needed.** `allowNonRegistryProtocols: false` in
  [pnpm-workspace.yaml](../../pnpm-workspace.yaml) refuses non-registry
  specifiers only when external packages declare them; a direct,
  workspace-declared git dependency installs, and the lockfile pins the
  resolved commit (`resolution: {commit: cc73f5fa…, type: git}`).
- The rest of the posture holds unchanged: `ignoreScripts: true` blocks
  lifecycle scripts (the package declares none anyway), `frozenLockfile`
  freezes the pin, and `minimumReleaseAge` is registry-only, so the immutable
  commit SHA is the supply-chain guarantee here.
- The install works even through the restricted Claude-web container proxy.
  One checkpoint for the first CI run: pnpm normalizes the specifier to a
  `git+ssh://git@github.com/…` resolution in the lockfile — confirm a cold
  `pnpm install` on the Actions runner fetches it (public repo; both the
  `github:` and `git+https://` specifier forms resolve to the same commit if
  one form ever misbehaves on a runner).

Upgrading the suite = replace the SHA in the specifier, run
`pnpm install --no-frozen-lockfile`, re-run triage + generate, refresh the
ledger and report, review the diff.

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
triage.json               committed group partition (see Triage); records the
                          suite commit it was derived from
quarantine.json           hand-maintained escape hatch (see Contingencies)
known-divergences.json    committed two-way verdict ledger
CONFORMANCE.md            committed per-file summary report
generated/                TS modules + index barrel — GITIGNORED build output,
                          rebuilt from node_modules by the build step
harness.ts                group/case runner helpers + result collection
official.test.ts          the driver
markerPairing.test.ts     CLAUDE.md marker-rule paired getRunTypeId test
generator.test.ts         codegen determinism pin (golden fixture)
vitest.config.ts          own project; plugin config mirrors the marker project
README.md
```

(The project's tsconfig, `tsconfig.suite-official.json`, sits at the package
root beside `tsconfig.test.json`, and the script's typed surface for
generator.test.ts is a sibling `.d.mts` beside the `.mjs`.)

One script owns the pipeline: `scripts/core/gen-json-schema-suite.mjs` with
subcommands `triage` / `generate` / `report`, exporting its functions so
`generator.test.ts` can unit-test them.

## Plan

### 1. the dependency (network only at install time)

Add the SHA-pinned devDependency above to the root `package.json` (all
devDependencies live root-level per CLAUDE.md). Everything downstream reads
the suite JSON from `node_modules/json-schema-test-suite/tests/draft2020-12/`
(+ `optional/format/`) — no network after install. `refRemote.json` is skipped
wholesale by a constant in the script (wholly remote-dependent).

### 2. triage (offline)

For each group of the installed suite files (keyed `file :: group
description`, stable across upgrades), classify into committed `triage.json`:

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

Because `generated/` is gitignored build output, there is no committed-drift
gate; generation is folded into
[scripts/core/build.mjs](../../scripts/core/build.mjs) (the `check:builds` /
`pretest` step every lane already runs, and which `rtx` triggers build-first),
so the modules exist before vitest boots and before typecheck. `generate`
fails loudly when `triage.json` was derived from a different suite commit than
the lockfile pins (the stale-triage guard). Determinism is pinned by
`generator.test.ts` instead of a git-diff check.

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

- A cold `pnpm install` brings the suite in at the pinned commit (CI runner
  included), and bumping the SHA + `pnpm install --no-frozen-lockfile` +
  triage + generate is the whole upgrade path — only `triage.json`, the
  ledgers and `CONFORMANCE.md` change in-repo.
- `pnpm run check:builds` leaves `generated/` populated, and the stale-triage
  guard trips when `triage.json` and the lockfile pin disagree.
- The lane runs in `pnpm test` (or its documented own script if measurement
  says so) and is green: every non-skipped case either conforms or matches a
  ledger entry, both directions enforced.
- `CONFORMANCE.md` is committed with real per-file numbers; the four known
  gaps show up as non-`byDesign` ledger entries cross-referenced from
  [json-schema-spec-conformance-gaps.md](json-schema-spec-conformance-gaps.md).
- `markerPairing.test.ts` and `generator.test.ts` pass; `pnpm run lint`,
  `pnpm run format` and the typecheck chain stay green.

## Shipped (2026-08-05)

Implemented as specified, with these observed outcomes:

- Triage over the pinned commit `cc73f5fa`: 396 groups considered → **319 ok,
  64 unsupported-input, 11 remote, 2 proto-literal** (plus refRemote.json's 15
  groups excluded at the file level). The whole probe pass takes ~11 s.
- First full run: **1988 cases → 1465 conforming, 13 by-design divergences,
  299 open divergences, 0 build-rejected, 171 unsupported-input cases, 40
  skipped** — see the lane's CONFORMANCE.md. The contingencies never fired:
  no transform halts (quarantine.json is empty) and no build-rejected groups;
  notably the MKR009 bare-constraint halt documented in
  json-schema-spec-conformance-gaps.md no longer reproduces (it now compiles
  and merely diverges), which is recorded as an update in that todo.
- `content.json` joined `format.json` as a by-design ledger default (both test
  annotation-only semantics the door deliberately enforces).
- The lane runs in ~10 s inside `pnpm test` as its own project; the four known
  gap families all appear in the ledger as non-byDesign entries.
