---
type: fix
spec: full-plan
status: open
created: 2026-07-30
---

# `rtx bench --one <competitor>` crashes in aggregate if an audit ran first

Hit while re-running a single competitor after a full `pnpm rtx bench --website`, during the JSON Schema lane work ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)).

## Problem

`container/benchmarks/aggregate.mjs:74` assumes every `results/*.json` is a competitor result:

```js
const byKey = new Map(results.map((r) => [r.competitor, new Map(r.cases.map((c) => [c.key, c]))]));
```

After an audit or typecost run, `results/` also holds files with no `cases` array:

```
ajv.alignment.json            typia.alignment.json
alignment-misalignments.json  zod.alignment.json
env.json                      ts-runtypes.compiletime.json
*.typecost.json               …
```

so aggregate dies:

```
TypeError: Cannot read properties of undefined (reading 'map')
    at file:///bench/aggregate.mjs:74:75
```

## Why only `bench-one`

The full path is safe by accident of ordering. `cmdFullbench` calls `clearResults()` with a predicate that wipes everything except `env.json` **before** any competitor runs, and the audit / typecost stages run **after** the aggregate. So aggregate only ever sees competitor files.

`cmdBenchOne` ([scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs)) clears only `<name>.json`, by design — the whole point is to re-run one competitor and keep the rest. That leaves every audit / typecost / compiletime artifact in place, and aggregate then chokes on the first one.

The competitor's own results file **is** written correctly before the crash, so the damage is limited to the aggregate table and `publishDocdata` never running. The workaround is to re-run `node scripts/website/bench-data/gen-docs.mjs` by hand, which is what was done here.

## Fix plan

Filter in `aggregate.mjs` rather than in the caller, so the guard holds no matter which verb assembled `results/`:

1. Skip any parsed file lacking `Array.isArray(r.cases)` **and** a `r.competitor` string, rather than trusting the glob. A single `.filter()` at the read site covers `env.json`, `*.alignment.json`, `*.typecost.json`, `*.compiletime.json` and `alignment-misalignments.json` at once, and stays correct when a new artifact kind is added.
2. Log what was skipped at note level, so a genuinely malformed competitor file is not silently dropped.
3. Consider having `cmdBenchOne` finish with the same `gen-docs.mjs` step `cmdWebsiteBench` runs, so a single-competitor re-run actually refreshes the website data instead of only `.docdata/`.

## Done when

- `pnpm rtx bench --one ajv` immediately after `pnpm rtx bench --website` completes cleanly, aggregate table included.
- A competitor results file that is genuinely malformed still surfaces rather than being skipped quietly.
