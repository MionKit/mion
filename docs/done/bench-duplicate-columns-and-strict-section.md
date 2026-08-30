---
type: fix
spec: full-plan
status: done
created: 2026-08-30
completed: 2026-08-30
---

# Fix duplicated benchmark columns and fold strict into the validation pages

Shipped. The sections below describe what was built; where the implementation diverged
from the original plan it has been rewritten to match reality, and the one deliberate
design change is called out under **Divergences from the plan**.

## Problem

### 1. Duplicated columns (the published bug)

Every validation-flavoured page publishes `zod`, `typebox` and `typia` twice, plus two
stray `ts-runtypes-type` / `ts-runtypes-schema` columns. `ts-runtypes` and `ajv` appear
once. Worse than cosmetic: the doubled libraries read `n-a` in **both** copies, so their
real numbers are gone from the page.

Root cause. The typecost lane writes its artifact with the exact shape of a timing
result, into the same directory the timing results live in:

```js
// container/benchmarks/typecost/typecost.mjs:459
const out = {competitor, cases, total};
fs.writeFileSync(path.join(RESULTS_DIR, `${competitor}.typecost.json`), ...);
```

Both readers of `results/` accept a file when `competitor` is a string and `cases` is an
array, with one filename exclusion for `.spec.json`:

- `scripts/website/bench-data/gen-docs.mjs:298` `readCompetitorResults`
- `container/benchmarks/aggregate.mjs:41` `load()`

`<form>.typecost.json` passes that filter. So after `pnpm rtx bench typecost` runs there
are ten "competitor" files instead of five, and:

- `gen-docs.mjs:338` builds the column list from those files, so names repeat.
- `gen-docs.mjs:325` `byCompetitor` is `new Map(results.map(...))`, so the LAST file under
  a name wins. `zod.typecost.json` sorts after `zod.json`, so the typecost map (no
  `validate` / `validationErrors` metrics) replaces zod's real timings.

Reproduced against a synthetic results dir:

```
columns: ["ts-runtypes","zod","zod","typebox","typebox","ajv","typia","typia","ts-runtypes-schema","ts-runtypes-type"]
row VALIDATION_string has data for: [ 'ts-runtypes', 'ajv' ]
```

`ts-runtypes` escapes the doubling because its typecost rows are named
`ts-runtypes-type` / `ts-runtypes-schema`; `ajv` escapes because it has no typecost row.

Blast radius: the `validation`, `validation-formats` and `strict` bench indexes (all three
read the same `competitors` list), the per-case hover panel columns, and `aggregate.mjs`'s
terminal table.

Why the existing test missed it. `packages/ts-runtypes-devtools/test/bench-lane-contracts.test.ts`
already claims to pin this tolerance, but its typecost fixture is invented and does not
match what the lane writes:

```ts
// bench-lane-contracts.test.ts:147 and :213
'ts-runtypes.typecost.json': JSON.stringify({library: 'ts-runtypes', instantiations: 1}),
```

`{library, instantiations}` is correctly skipped. `{competitor, cases, total}`, the real
shape, is not.

### 2. The strict page

`emitStrictBench` (`gen-docs.mjs:381`) emits one column per (library, runtime) pair, so
ten columns before the duplication bug doubles them again. It is unreadable, and the
strict numbers belong next to the validation numbers they should be compared against.

## What shipped

### Part A: one trustworthy results reader

1. **One shared loader.** Extract the reader into `container/benchmarks/_lib/read-results.mjs`
   and import it from BOTH `aggregate.mjs` and `gen-docs.mjs`. They are two copies of the
   same logic today, and this bug landed in both. `_lib/` is already the shared host and
   container home (`extract-cases.mjs`).

2. **Accept only what a timing result is**, on filename AND shape:
   - filename matches `^[^.]+\.json$`. A competitor result is always `<name>.json`, every
     artifact is `<name>.<kind>.json`. That one rule kills `.typecost.json`,
     `.alignment.json`, `.compiletime.json` and the `.spec.json` special case together.
   - shape also carries `summary` (object), which `writeResult` always emits
     (`shared/harness/result.ts:113`) and no artifact does.
   - the "name what was skipped" note survives as a `note` callback the caller supplies,
     so `aggregate.mjs` keeps printing to stdout and `gen-docs.mjs` to stderr from one
     implementation.

3. **Hard-fail on a duplicate competitor name.** Two accepted files claiming the same name
   throw, naming both, instead of silently publishing two columns. (`throw`, not `die()`:
   the module is shared with the container-side `aggregate.mjs`, which cannot import the
   host-only `scripts/lib/proc.mjs`.) A silent duplicate is what shipped; it cannot ship
   again.

### Part B: strict becomes a section of the validation pages

4. **Stop emitting the strict bench.** Delete `emitStrictBench` (`gen-docs.mjs:381-443`)
   and the `isStrict` exclusion (`gen-docs.mjs:359`, used at `:363` and `:369`), so strict
   rows flow into the `validation` bench like every other suite. They land as their own
   `STRICT` section because sections are keyed by `row.group`.
   `orderedSections` (`BenchTable.vue:387`) hoists REALWORLD first and keeps the rest in
   order, so STRICT lands last on both pages. No component change needed.

5. **Section label.** `sectionLabel('STRICT')` renders "Strict". Add a small label override
   in gen-docs so it reads **"Strict (no unknown keys)"**, which says what the section
   measures without prose.

6. **Delete the strict page** `container/website/sites/runtypes/content/07.benchmarks/09.strict.md`.
   Nothing else links to it (grepped: only gen-docs and the page itself mention `strict`).

7. **Keep the bun lane running.** Only the published table goes away. `checkEngineBranch`
   (`bench.mjs:257`) still hard-fails when `rt::countEnumKeys` picks the wrong counter, and
   `pnpm rtx bench engine-check` still runs in `website-deploy.yml:187`. The per-engine
   invariant stays pinned by CI, it just stops being a website column. `results/bun/` keeps
   being written; nothing reads it for the website any more.

### Part C: the fourth strict case

8. **Add `STRICT.realworld_order`** to `container/benchmarks/shared/cases/strict/index.ts`,
   alongside `flat_required`, `nested_required` and `moltar_dto`. It reuses
   `REALWORLD.order`'s shape unchanged, optional `note` included:

   ```ts
   export interface StrictOrder {
     id: string;
     customer: {id: number; email: string};
     items: {sku: string; name: string; qty: number; price: number}[];
     shipping: {street: string; city: string; state: string; zip: string; country: string};
     status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
     total: number;
     note?: string;
   }
   ```

   Strict means no undeclared keys. It does not mean all-required, and RunTypes has no
   strict flag on the validator: there is nothing for it in `ValidateOptions`
   (`packages/ts-runtypes/src/createRTFunctions.ts:25`), so strictness is composed the way
   the existing cases already do it, `validate(value) && !hasUnknownKeys(value)`.
   `createHasUnknownKeysFn` handles optional keys fine. `runsAfterValidation: true` is only
   an optimisation opt-in: all-required object nodes get the `countEnumKeys(v) !== N`
   check, nodes carrying an optional fall back to the key-array scan, and both are correct
   (`createRTFunctions.ts:114-131`, `runtypes/pure-fns-utils.ts:51`).

   That makes this case a coverage GAIN, not a compromise: `flat_required`,
   `nested_required` and `moltar_dto` keep covering the count fast path, and
   `realworld_order` is the first case covering the scan path on a realistic shape.
   There is no exported `createGetUnknownKeysFn`, only the internal
   `rt::getUnknownKeysFromArray` pure fn, so `createHasUnknownKeysFn` is the tool.

   Samples follow the group's pattern: valid orders with and without `note`, plus invalids
   for an undeclared key at the root, one inside `customer`, one inside an `items`
   element, one inside `shipping`, a missing required key, a wrong type, `null`, and a
   non-object.

9. **Add the case to all five competitor maps.** The maps are total over `CaseKey`, so a
   missing entry fails the typecheck gate. Mirror each map's existing STRICT entries:
   - `competitors/ts-runtypes/cases.ts:2787` — inline interface, `createValidateFn` plus
     `createHasUnknownKeysFn(undefined, {runsAfterValidation: true})`, both `build` and
     `buildErrors`.
   - `competitors/zod/cases.ts:1965` — nested `z.strictObject`, `buildErrors` only.
   - `competitors/typebox/cases.ts:3799` — `additionalProperties: false` at every level.
   - `competitors/ajv/cases.ts:3444` — same, in its JSON Schema document.
   - `competitors/typia/cases.ts:2806` — `createEquals` / `createValidateEquals`.

10. **Rewrite the group header comment** in `shared/cases/strict/index.ts`. Two of its
    claims go stale: "why this group exists as its own page", and "every case is
    all-required ... an OPTIONAL property anywhere would silently drop the case back to the
    scan and quietly remove the coverage this group is for". Replace the second with the
    real rule: the first three cases stay all-required so the count fast path keeps its
    coverage, and `realworld_order` deliberately carries an optional key to cover the scan
    path.

## Tests

All in `packages/ts-runtypes-devtools/test/bench-lane-contracts.test.ts` (29 tests, green):

- The invented typecost fixture (`{library, instantiations}`) is replaced by a
  `typecostArtifact()` helper emitting the REAL `{competitor, cases, total}`, used by both
  reader suites. A companion test asserts that helper still matches the writer's own
  source (`const out = {competitor, cases, total};` and the `.typecost.json` filename), so
  the fixture cannot silently drift from the lane again. That drift is the whole reason
  this bug shipped under a test that claimed to cover it.
- `never absorbs a typecost artifact as a competitor` — the regression test: a results dir
  holding `zod.json` plus four real typecost artifacts reads back exactly `['zod']`.
- The aggregate suite asserts each table header names `zod` once and never mentions
  `ts-runtypes-type`.
- `fails loudly when two files claim the same competitor` — asserts the throw names both
  files.
- `has one results-directory reader, shared with aggregate.mjs` — pins that `gen-docs.mjs`
  has exactly one `readdirSync` left (the sample-map walk) and `aggregate.mjs` none, and
  that both import the `_lib` module.
- A new `the strict suite is a section of the validation bench` block: no `emitStrictBench`,
  no `bench: 'strict'`, no `row.suite === 'strict'` filter, the label override is present,
  the page file is gone, and `checkEngineBranch` still pins `rt::countEnumKeys` so dropping
  the published column did not drop the invariant.
- A new `the STRICT case set` block: all four keys present in all five competitor maps; the
  first three interfaces stay all-required (so the count fast path keeps its coverage); and
  `realworld_order` declares `note?: string` with samples that accept the optional key both
  present and absent while rejecting an undeclared one. That last one is what pins "strict
  means no unknown keys, not all-required".

Not a fuzz candidate: data plumbing plus one benchmark case, with no round-trip,
determinism or trusted-source oracle worth building a suite around.

## Verification

Ran and green:

- `pnpm run test:ci` — 85 files, 1031 tests, all four batches passing.
- `pnpm run lint` (oxlint + eslint + typecheck) and `pnpm run format`, both clean.
- The generator end-to-end on the host against a synthetic results dir carrying real-shaped
  `.typecost.json` artifacts plus strict-suite rows:

```
columns: ["ts-runtypes","zod","typebox","ajv","typia"]
sections: ATOMIC[Atomic]:1 REALWORLD[Realworld]:1 STRICT[Strict (no unknown keys)]:2
strict row data for: [ 'ts-runtypes', 'zod', 'typebox', 'ajv', 'typia' ]
```

  and no `bench-data/strict/` directory produced.

- MDC-component and code-fence counts on both edited pages match their pre-edit baseline
  (2 `::` lines, 0 fences each); only prose was added.
- The new case's sample LABELLING checked against an independent strict implementation:
  the host's zod built the same closed schema and ran it over
  `STRICT.realworld_order.getSamples()` — 2 valid pass, 9 invalid rejected, no
  mislabelled sample. Worth doing because a wrongly labelled sample would not fail any
  test here; it would quietly show up as a cross-library divergence on the Correctness
  page instead.

The container lane too. podman IS installed by the setup script and the GHCR credentials
are exported into the session, so the image pulls and the lane runs; an earlier claim that
this could not be checked here was wrong.

- `pnpm rtx bench typecheck` — all five competitor projects total over `CaseKey`. This
  caught a real gap: `competitors/ts-runtypes/schemaCases.ts` (the builder form) is total
  over the SAME union, so the case had to land there as well. Fixed, and the presence test
  now walks every map annotated `CompetitorCases` rather than only `cases.ts`, which is
  what let the gap through.
- `pnpm rtx bench bench-one ts-runtypes` — the real lane, with the new case measured:

```
· STRICT
  flat_required                          20M/s
  nested_required                        22M/s
  moltar_dto                             18M/s
  realworld_order                         5M/s
```

  and the index it generated carries the four-case `Strict (no unknown keys)` section with
  real numbers, with no `bench-data/strict/` directory.

One pre-existing failure surfaced by that run is NOT from this change and is delegated to a
parallel session: `NUMBER_FORMAT.number_float` reports `invalid[0] accepted` on both
metrics. The BENCHMARK CASE is the wrong side, not the validator: `float` is documented as
a generation tag, "NEVER a failable constraint"
(`packages/ts-runtypes/src/formats/numberFormats.ts:22`), so accepting `1` is correct.
Spec: `docs/todos/bench-float-format-sample-mislabelled.md`. Nothing in this diff touches
format validation.

**Merge order:** the FormatFloat fix PR merges BEFORE this work's PR. After it lands,
rebase this branch on `main` and drop the `docs/todos/` copy of that spec, which will then
live in `docs/done/`.

## Docs

- Deleted `container/website/sites/runtypes/content/07.benchmarks/09.strict.md`.
- A three-line paragraph added above the table on `01.validation.md` and
  `03.getvalidationerrors.md` introducing the strict section: a value is accepted only when
  it matches its type and carries nothing else, so an extra key is a rejection rather than
  something quietly ignored. No per-runtime explanation carried over.
- `container/benchmarks/README.md` never named the strict page, so it needed no edit.

## Divergences from the plan

1. **The shape check requires `summary` only, not `summary` + `runtime`.** The filename rule
   already rules out every artifact by itself, so `runtime` bought no extra power and would
   have rejected any result file predating the bun lane.
2. **The duplicate-name failure `throw`s rather than calling `die()`.** The shared module is
   imported by the container-side `aggregate.mjs`, which cannot reach the host-only
   `scripts/lib/proc.mjs`.
3. **The skipped-file note is a caller-supplied callback** rather than baked into the
   module, so each caller keeps the stream it already wrote to (stdout for aggregate,
   stderr for gen-docs).
4. **The "fixture matches the writer" requirement became an assertion against the writer's
   source** rather than importing its shape, since `typecost.mjs` builds the object inline
   and exports nothing.

## Out of scope

- Redesigning the strict benchmark itself, or publishing the bun lane anywhere else. The
  runtime dimension is dropped from the website by design.
- Any change to the typecost / compiletime / alignment pages beyond the shared reader.
- Re-tuning the aggregate geomean now that strict rows join it. Strict rows join the
  validation overall geomean; that is intended.

## Done when

All met, with the one caveat above that the container lane could not run here:

- The emitted `validation` index lists exactly `["ts-runtypes","zod","typebox","ajv","typia"]`
  and every column carries real numbers again.
- No `bench-data/strict/` directory is emitted and `09.strict.md` is gone.
- Both validation pages end with a "Strict (no unknown keys)" section holding
  `flat_required`, `nested_required`, `moltar_dto` and `realworld_order`.
- A typecost artifact in `results/` can no longer become a column, pinned by a test built
  from the real writer's shape, and a duplicate competitor name fails loudly.
- `pnpm run test:ci`, `pnpm run lint` and `pnpm run format` are clean.
