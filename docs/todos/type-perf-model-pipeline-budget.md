---
type: chore
spec: guidelines
status: ready
created: 2026-08-27
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
