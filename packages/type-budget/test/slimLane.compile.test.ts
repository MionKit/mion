// STAGE-1 SPIKE budgets for the slim drizzle-free builder core
// (docs/todos/drizzle-slim-builders.md). Same rules as
// modelPipeline.compile.test.ts: deltas are the metric, budgets are hand-set
// and ONE-WAY DOWNWARD (see that file's header for the update workflow).
//
// What this lane proves before the real packages are built (stages 2-4):
// - the slim authoring surface + flat models cost near the builder-lane floor,
//   not the drizzle lane's 12186 for steps 1-4;
// - the control steps (route api / initClient) stay near the drizzle lane's,
//   so the comparison is apples to apples;
// - toDrizzle's SYNTHESIZED drizzle typing (option (a) of the spec) type-checks
//   through db.select/insert/update and its cost stays confined to the db step.
//   Option (b) — replaying drizzle's own builder generics — needs no separate
//   measurement: its cost IS the drizzle lane's step 1 (5025 for this table).

import {describe, it, expect, beforeAll} from 'vitest';
import {SLIM_STEPS, SLIM_SHAPE_PINS, measureSlimLane, slimSnippetUpTo} from './slimLaneHarness.ts';

const cumulative: number[] = [];
const deltas: number[] = [];

describe('slim spike — per-step type-instantiation budget', () => {
  beforeAll(() => {
    let previous = 0;
    for (let i = 0; i < SLIM_STEPS.length; i++) {
      const result = measureSlimLane(slimSnippetUpTo(i));
      expect(result.errors, `step "${SLIM_STEPS[i].label}" should type-check cleanly:\n  ${result.errors.join('\n  ')}`).toEqual(
        []
      );
      cumulative.push(result.netInstantiations);
      deltas.push(result.netInstantiations - previous);
      previous = result.netInstantiations;
    }
    const table = SLIM_STEPS.map(
      (step, i) =>
        `  ${step.label.padEnd(26)} delta=${String(deltas[i]).padStart(6)}  budget=${String(step.budget).padStart(6)}  cumulative=${cumulative[i]}`
    ).join('\n');
    // eslint-disable-next-line no-console
    console.log(`net instantiations per slim-spike step:\n${table}`);
  });

  for (let i = 0; i < SLIM_STEPS.length; i++) {
    const step = SLIM_STEPS[i];
    it(`${step.label} stays within its budget`, () => {
      expect(
        deltas[i],
        `"${step.label}" added ${deltas[i]} net instantiations, over its budget of ${step.budget} — a type-cost regression in that layer`
      ).toBeLessThanOrEqual(step.budget);
    });
  }

  it('the chain resolves to real formats and real db rows, not any', () => {
    const result = measureSlimLane(slimSnippetUpTo(SLIM_STEPS.length - 1) + SLIM_SHAPE_PINS);
    expect(result.errors, `shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
  });
});
