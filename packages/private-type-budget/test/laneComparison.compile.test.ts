// Three ways to declare one model (slim table, plain type-only row, RT.* / TF.* builder row), priced per dialect.
// Only the DECLARATION differs, so the gap is its price; the slim lane's db step has no counterpart and is priced in
// the pipeline suite. Alternatives get one-way-downward budgets (rule in modelPipeline.compile.test.ts); the slim
// lane is re-measured, not read from its budgets. It prices, never ranks: only slim keeps schema and API in sync.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {alternativeLanes, laneSnippetUpTo, type Lane} from './alternativeLanesHarness.ts';
import {PIPELINE_DIALECTS} from './modelPipelineHarness.ts';
import {writeComparisonReport, type DialectComparisonReport, type LaneReport} from './report.ts';

const drizzleVersion: string = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  .dependencies['drizzle-orm'];

/** Per-step deltas, keyed by `dialect/lane`. **/
const deltas = new Map<string, number[]>();

function measureLane(dialect: string, lane: Lane): number[] {
  const perStep: number[] = [];
  let previous = 0;
  for (let i = 0; i < lane.steps.length; i++) {
    const result = lane.measure(laneSnippetUpTo(lane, i));
    expect(
      result.errors,
      `${dialect} ${lane.name} lane, step "${lane.steps[i].label}" should type-check cleanly:\n  ${result.errors.join('\n  ')}`
    ).toEqual([]);
    perStep.push(result.netInstantiations - previous);
    previous = result.netInstantiations;
  }
  return perStep;
}

/** Each dialect's lanes: its slim pipeline's five shared steps, then the two alternatives. **/
const COMPARISONS = PIPELINE_DIALECTS.map(({dialect, steps, measure}) => {
  const slim: Lane = {name: 'slim', steps: steps.slice(0, 5), measure, shapePins: ''};
  const alternatives = alternativeLanes(dialect);
  return {dialect, alternatives, lanes: [slim, ...alternatives]};
});

const laneDeltas = (dialect: string, lane: Lane) => deltas.get(`${dialect}/${lane.name}`)!;
const total = (dialect: string, lane: Lane) => laneDeltas(dialect, lane).reduce((sum, delta) => sum + delta, 0);

describe('model declaration approaches, cost comparison', () => {
  afterAll(() => {
    if (deltas.size !== COMPARISONS.reduce((sum, comparison) => sum + comparison.lanes.length, 0)) return;
    writeComparisonReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      dialects: COMPARISONS.map(
        ({dialect, lanes}): DialectComparisonReport => ({
          dialect,
          lanes: lanes.map(
            (lane): LaneReport => ({
              name: lane.name,
              steps: lane.steps.map((step, i) => ({
                step: i + 1,
                label: step.label.replace(/^\d+ \+? ?/, ''),
                delta: laneDeltas(dialect, lane)[i],
                budget: step.budget,
              })),
              total: total(dialect, lane),
            })
          ),
        })
      ),
    });
  });

  for (const {dialect, alternatives, lanes} of COMPARISONS) {
    describe(dialect, () => {
      beforeAll(() => {
        for (const lane of lanes) deltas.set(`${dialect}/${lane.name}`, measureLane(dialect, lane));
        const header = `  ${'step'.padEnd(34)}${lanes.map((l) => l.name.padStart(10)).join('')}`;
        const rows = lanes[1].steps
          .map(
            (step, i) => `  ${step.label.padEnd(34)}${lanes.map((l) => String(laneDeltas(dialect, l)[i]).padStart(10)).join('')}`
          )
          .join('\n');
        const totals = `  ${'TOTAL'.padEnd(34)}${lanes.map((l) => String(total(dialect, l)).padStart(10)).join('')}`;
        // eslint-disable-next-line no-console
        console.log(`${dialect}: net instantiations by model-declaration approach:\n${header}\n${rows}\n${totals}`);
      });

      for (const lane of alternatives) {
        for (let i = 0; i < lane.steps.length; i++) {
          const step = lane.steps[i];
          it(`${dialect}: ${lane.name}: ${step.label} stays within its budget`, () => {
            const delta = laneDeltas(dialect, lane)[i];
            expect(
              delta,
              `${dialect} "${step.label}" in the ${lane.name} lane added ${delta} net instantiations, over its budget of ${step.budget}`
            ).toBeLessThanOrEqual(step.budget);
          });
        }

        // Without this a lane could look cheap simply by having lost the formats.
        it(`${dialect}: ${lane.name}: the row still carries the refined formats`, () => {
          const result = lane.measure(laneSnippetUpTo(lane, lane.steps.length - 1) + lane.shapePins);
          expect(result.errors, `${dialect} ${lane.name} shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
        });
      }

      // A wide gap means a lane's model reaches the router or client differently, skewing the comparison above.
      // Not zero, the builder lane spells readonly params; the threshold sits above today's spread to catch drift.
      it(`${dialect}: the shared route and client steps cost about the same in every lane`, () => {
        for (const stepIndex of [3, 4]) {
          const costs = lanes.map((lane) => laneDeltas(dialect, lane)[stepIndex]);
          const spread = (Math.max(...costs) - Math.min(...costs)) / Math.min(...costs);
          expect(
            spread,
            `${dialect} step ${stepIndex + 1} costs ${costs.join(' / ')} across ${lanes.map((l) => l.name).join(' / ')}, the shared steps drifted apart`
          ).toBeLessThan(0.3);
        }
      });
    });
  }
});
