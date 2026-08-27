---
type: chore
spec: guidelines
status: done
created: 2026-08-27
updated: 2026-08-27
---

# Type-instantiation cost budget for the full model pipeline

## Intent

The model workflow now stacks several type-level layers: drizzle table -> proxy format stamps -> refineTableType -> InferSelect/InferInsert/InferUpdate -> a mion route with error unions in the return -> the client's Result-tuple mapping. Each layer is mapped-type surgery over drizzle's already-heavy generics, and nothing measures what each step costs the TypeScript checker. Build a measurement (a test with budgets, or at least a tool) that reports type instantiations per STEP of that chain, so a regression in any layer (ours or a drizzle upgrade) turns red instead of silently making every consumer's editor slower.

## Direction

- REUSE the existing budget-harness pattern: `packages/ts-runtypes/test/types/compileHarness.ts` compiles snippets through the real TypeScript compiler in-process and reports the `Instantiations` / `Types` counters (the same numbers `tsc --extendedDiagnostics` prints), with `netInstantiations` subtracting an empty-snippet baseline and budgets that may only ever be LOWERED (`dataonly.compile.test.ts` documents the tuning workflow). The pipeline harness wants the same shape: per-step nets, one-way-downward budgets, printed numbers for tuning.
- The difference from the existing harness: the chain needs REAL module resolution (drizzle-orm d.ts, the dialect package, @ts-runtypes/core, @mionjs/router, @mionjs/client), not a sliced lib-only preamble. So the measurer needs a resolving Program (the `type-inference.spec.ts` stub runners already build one via a stubs tsconfig; the harness needs the diagnostics counters from it).
- Measure CUMULATIVE snippets and report per-step DELTAS (step N minus step N-1): (1) plain drizzle table as the baseline, (2) proxy-built table, (3) + refineTableType, (4) + the Infer* models, (5) + a mion route api with RpcError unions in returns, (6) + initClient over that api (the Result-tuple mapping). The deltas are the metric; the raw totals are noise from drizzle's own types.
- Placement: an UNPUBLISHED package, so the cross-family imports (drizzle + runtypes + router + client) never leak into a published package's dependency tree. `packages/test-server` already depends on most of the chain; a small private harness package (or a spec living in an existing private package) are both acceptable, the implementer decides - the only hard constraint is "never a published package".
- For deep dives (not the gate), note `tsc --generateTrace` + `@typescript/analyze-trace` as the drill-down tool when a budget trips; the budget test itself stays cheap counters.
- The implementer plans the details: the exact snippet set, budget seeding, where the harness lives, and whether tsgo can serve as the compiler instead of tsc.

## Done when

A `pnpm test`-run spec (or an rtx tool, if a test proves too slow) prints per-step net instantiation counts for the six-step chain and fails when a step exceeds its budget; budgets are seeded from the current tree and documented as one-way-downward, same as the existing compile-budget harnesses.

## Plan — as built (approved 2026-08-27)

**Shipped 2026-08-27.** A new private package, `@mionjs/type-budget`
([packages/type-budget/](../../packages/type-budget/)), measures the six-step chain and fails
when a step costs more than its budget. It ships nothing, so the cross-family imports (drizzle
plus runtypes plus router plus client) never reach a published dependency tree.

### How it measures

[test/modelPipelineHarness.ts](../../packages/type-budget/test/modelPipelineHarness.ts) reuses
`makeMeasurer` from
[packages/ts-runtypes/test/types/compileHarness.ts](../../packages/ts-runtypes/test/types/compileHarness.ts)
rather than copying it, so counting, baseline subtraction and snippet-relative error lines stay
identical across every budget suite in the repo. `makeMeasurer` already carried an unused
`MeasurerConfig.snippetFile` for exactly this real-import case; this change adds the one thing
it was missing, `diagnosticsScope: 'program' | 'snippet'`, so a resolving measurer reports only
the snippet's own errors instead of type-checking every resolved source file in the graph.

The snippet is a virtual file at a real path inside the package, so its bare imports resolve
through that package's node_modules exactly as a consumer's would. The import header is the
measurer's preamble, present in all seven programs, so module resolution never lands in a delta.
Compiler options mirror a real consumer: bundler resolution, the `source` condition, the client's
own lib set (es2023 plus DOM), `skipLibCheck`.

### The six steps

Cumulative snippets, per-step deltas. **Every body calls the thing and consumes the result** —
reading fields into annotated consts, building real payload literals, returning a real row from
a handler, destructuring the client's Result tuple. Declaring a type measures nothing: the
checker stays lazy and the step looks free.

Budgets seeded from the current tree, one-way downward:

```
1 plain drizzle table    5025
2 + proxy-built table    2108
3 + refineTableType      4430
4 + Infer* models         682
5 + mion route api        540
6 + initClient           2319
```

`refineTableType` is the expensive layer, roughly twice the proxy stamping and eight times the
`Infer*` models.

### The shape-pin guard

One extra test compiles the chain with `Expect<Equal<…>>` assertions on the refined formats, the
insert optionality and the client tuple's value and error slots. It is load-bearing, not
decoration: if module resolution breaks (a stale workspace install is how it happens in practice)
the whole chain silently collapses to `any`, every delta drops, and a downward-only ratchet goes
green on a measurement of nothing. This was observed for real while building the harness.

### Scope

The **pg** dialect only. The three dialect packages share the same stamping and refine machinery,
so measuring one carries the signal and measuring three triples the runtime for nothing.

### Wiring

`type-budget` added to the root [vitest.config.ts](../../vitest.config.ts) projects and to the
`test:ci` batching in the root [package.json](../../package.json); a reference added to the root
[tsconfig.json](../../tsconfig.json). Two stale vitest-project counts fixed along the way (the
root config comment and [CLAUDE.md](../../CLAUDE.md), both already wrong before this change).

### Not done, on purpose

- **No website docs.** A contributor-only measurement tool does not belong in the consumer docs
  tree. The tuning workflow lives in the test file header, same as the existing compile-budget
  harnesses.
- **No fuzzing.** A deterministic counter over a fixed snippet set has no oracle to fuzz against.
- **`tsc --generateTrace` stays a manual drill-down**, as the direction asked: the test file
  header points at it plus `@typescript/analyze-trace` for when a budget trips. The gate itself
  stays cheap counters (about 3 seconds for all seven programs).
