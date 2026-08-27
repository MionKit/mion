// Per-STEP type-instantiation budget for the full model pipeline.
//
// The model workflow stacks six type-level layers, each one mapped-type surgery
// over drizzle's already heavy generics:
//
//   1 plain drizzle table  →  2 proxy format stamps  →  3 refineTableType
//   →  4 InferSelect/Insert/Update  →  5 a mion route api with RpcError unions
//   →  6 initClient's Result-tuple mapping
//
// Nothing else measures what a layer costs the TypeScript checker, so a
// regression (ours, or a drizzle-orm upgrade) shows up only as every consumer's
// editor getting slower. This suite compiles the six snippets CUMULATIVELY
// through the real compiler against the real module graph and asserts each
// step's DELTA over the one before it. The deltas are the metric; the raw
// totals are mostly drizzle's own types and carry no signal.
//
// ──────────────────── UPDATING A BUDGET — READ THIS ────────────────────
// Budgets are NOT auto-derived; you update them BY HAND. The suite prints a
// `delta / budget` table on every run. After ANY change to a layer, or to a
// snippet here, re-run and compare each printed delta to its budget:
//
//   • delta WENT DOWN  → you made the layer cheaper. Set its budget to the new
//                        (lower) delta to lock the win in.
//   • delta UNCHANGED  → nothing to do.
//   • delta WENT UP    → a cost regression. Do NOT raise the budget to make the
//                        test pass, that silently defeats the guard. Fix the
//                        layer so the delta returns to (or below) its budget.
//
// A budget may ONLY ever be set LOWER than its current value, never higher. (A
// genuinely unavoidable increase — a deliberate new capability in a layer — is a
// reviewed exception to call out explicitly in the PR, not the default path.)
// Counts are deterministic because `typescript` and `drizzle-orm` are both
// exact-pinned; bumping either is the one event that re-baselines every step.
//
// ──────────────────── WHEN A BUDGET TRIPS ────────────────────
// These counters say WHICH layer got more expensive, never why. For the why,
// run `tsc --generateTrace <dir>` over a file exercising that layer and open the
// result with `@typescript/analyze-trace`; it names the individual types the
// checker spent its time on. The budget test itself deliberately stays cheap
// counters so it can run on every `pnpm test`.

import {describe, it, expect, beforeAll} from 'vitest';
import {PIPELINE_STEPS, SHAPE_PINS, measurePipeline, snippetUpTo} from './modelPipelineHarness.ts';

/** Net instantiations of each cumulative snippet, indexed by step. **/
const cumulative: number[] = [];
/** What each step ADDED over the step before it — the budgeted metric. **/
const deltas: number[] = [];

describe('model pipeline — per-step type-instantiation budget', () => {
  beforeAll(() => {
    let previous = 0;
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const result = measurePipeline(snippetUpTo(i));
      expect(
        result.errors,
        `step "${PIPELINE_STEPS[i].label}" should type-check cleanly:\n  ${result.errors.join('\n  ')}`
      ).toEqual([]);
      cumulative.push(result.netInstantiations);
      deltas.push(result.netInstantiations - previous);
      previous = result.netInstantiations;
    }
    const table = PIPELINE_STEPS.map(
      (step, i) =>
        `  ${step.label.padEnd(24)} delta=${String(deltas[i]).padStart(6)}  budget=${String(step.budget).padStart(6)}  cumulative=${cumulative[i]}`
    ).join('\n');
    // eslint-disable-next-line no-console
    console.log(`net instantiations per pipeline step:\n${table}`);
  });

  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    const step = PIPELINE_STEPS[i];
    it(`${step.label} stays within its budget`, () => {
      expect(
        deltas[i],
        `"${step.label}" added ${deltas[i]} net instantiations, over its budget of ${step.budget} — a type-cost regression in that layer`
      ).toBeLessThanOrEqual(step.budget);
    });
  }

  // Without this the budgets are meaningless: if the workspace install is stale
  // and the imports fail to resolve, every type in the chain becomes `any`, the
  // deltas collapse, and a downward-only ratchet passes on a measurement of
  // nothing. These assertions only compile when the real formats came through.
  it('the chain resolves to real formats, not any', () => {
    const result = measurePipeline(snippetUpTo(PIPELINE_STEPS.length - 1) + SHAPE_PINS);
    expect(result.errors, `shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
  });
});
