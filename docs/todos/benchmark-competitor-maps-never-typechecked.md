---
type: chore
spec: full-plan
status: open
created: 2026-07-30
---

# Benchmark competitor-map totality is declared but never enforced

Found while adding the JSON Schema benchmark lane ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)). Predates that work.

## Problem

Every competitor map declares itself total:

```ts
export type CompetitorCases = Record<CaseKey, CaseEntry>;   // shared/harness/types.ts
```

The design intent is "a new shared case key widens `CaseKey`, and every competitor map fails to compile until each key is filled or explicitly `NOT_SUPPORTED`" — compilation as the coverage proof. **Nothing in CI ever runs `tsc` over `container/benchmarks`**, so that proof does not exist:

- The root `typecheck` script covers `typecheck:test`, two `ts-go-runtypes/internal/testfixtures` projects and `packages/examples`. Never `container/benchmarks`.
- Each competitor's build is `vite build` (esbuild transpile, types stripped, no checking); typia's is `node esbuild.config.mjs`.

So a missing key is not a build failure, it is a silently absent column.

## Evidence it has already drifted

`competitors/ts-runtypes/schemaCases.ts` is annotated `CompetitorCases` and its header says "TOTAL over every key", but it was missing three keys that exist in `cases.ts`:

- `CIRCULAR_REFS.linked_list_cycle`
- `CIRCULAR_REFS.tree_cycle`
- `CIRCULAR_REFS.object_self_cycle`

The whole `CIRCULAR_REFS` group was simply absent. Its `tsconfig.json` does include the file, so a manual `tsc -p` would have caught it on the day it drifted. (Those three were filled in as part of the rollout, since that map was being extended anyway; the missing GATE is what this todo is about.)

## Why it is not a one-line fix

The competitor deps live only inside the `tsrt-website` image (`container/benchmarks/_deps/**`, installed per-competitor at `/bench/competitors/<name>/node_modules`), never on the host. A host-side `tsc -p container/benchmarks/competitors/ajv/tsconfig.json` fails on unresolved `ajv`. So the check has to run **inside the container**, which is why it was never wired into the root `typecheck`.

## Fix plan

1. Add a `typecheck` script to each competitor's in-container project (`tsc -p tsconfig.json --noEmit`), plus one for `shared/`.
2. Add a `typecheck` sub-verb to [scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs) that runs them all in the bench container, and surface it as `pnpm rtx bench typecheck`.
3. Call it from the `smoke` lane in [.github/workflows/ci.yml](../../.github/workflows/ci.yml) (the job that already pulls the shared image), so a drifted map fails a PR.
4. Note in [container/benchmarks/README.md](../../container/benchmarks/README.md) that totality is enforced by that verb, not by the type annotation alone.

Expect the first run to surface more drift than the three keys above — treat whatever it finds as part of this todo.

## Done when

- `pnpm rtx bench typecheck` typechecks every competitor map plus `shared/` inside the container and exits non-zero on a missing or excess key.
- CI runs it, and deleting a key from any competitor map makes CI fail.
