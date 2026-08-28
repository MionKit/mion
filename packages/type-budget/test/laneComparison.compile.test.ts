// Three ways to declare the same model, priced side by side.
//
//   slim       a table built from the slim recorder builders, model derived flat
//   type-only  the row written as a plain TypeScript type (formats by hand)
//   builder    the row built with the RT.* / TF.* value-first builders
//
// All three end in the same place: the same refinement, the same
// Select/Insert/Update models, the same mion route api, the same client. Only
// how the row is DECLARED differs, so the gap between the totals is the price of
// each approach and nothing else. The slim lane's sixth step (the db query
// through toDrizzle) has no counterpart in the other lanes — they yield no
// runnable table at all — so the comparison covers the five shared steps and
// the db cost lives in the pipeline suite.
//
// The two alternative lanes get budgets on the same one-way-downward terms as
// the slim lane (see modelPipeline.compile.test.ts for the full rule). The
// slim lane is re-measured here rather than read from its budgets, so the
// comparison is measurement against measurement.
//
// What this suite does NOT do is pick a winner. The slim lane derives the
// model from the table, so the database schema and the API types cannot drift
// apart. The other two hand you that consistency to maintain by hand. These
// numbers price that guarantee; choosing is a separate conversation.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ALTERNATIVE_LANES, laneSnippetUpTo, type Lane} from './alternativeLanesHarness.ts';
import {PIPELINE_STEPS, measurePipeline, snippetUpTo} from './modelPipelineHarness.ts';
import {writeComparisonReport, type LaneReport} from './report.ts';

const drizzleVersion: string = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  .dependencies['drizzle-orm'];

/** The slim lane (the pipeline's five shared steps) wrapped as a Lane so all
 *  three measure through one path. **/
const SLIM_LANE: Lane = {
  name: 'slim',
  steps: PIPELINE_STEPS.slice(0, 5),
  measure: measurePipeline,
  shapePins: '',
};

const LANES: Lane[] = [SLIM_LANE, ...ALTERNATIVE_LANES];

/** Per-step deltas, keyed by lane name. **/
const deltas = new Map<string, number[]>();

function measureLane(lane: Lane): number[] {
  const perStep: number[] = [];
  let previous = 0;
  for (let i = 0; i < lane.steps.length; i++) {
    const result = lane.measure(lane === SLIM_LANE ? snippetUpTo(i) : laneSnippetUpTo(lane, i));
    expect(
      result.errors,
      `${lane.name} lane, step "${lane.steps[i].label}" should type-check cleanly:\n  ${result.errors.join('\n  ')}`
    ).toEqual([]);
    perStep.push(result.netInstantiations - previous);
    previous = result.netInstantiations;
  }
  return perStep;
}

const total = (lane: Lane) => deltas.get(lane.name)!.reduce((sum, d) => sum + d, 0);

describe('model declaration approaches — cost comparison', () => {
  beforeAll(() => {
    for (const lane of LANES) deltas.set(lane.name, measureLane(lane));
    const header = `  ${'step'.padEnd(34)}${LANES.map((l) => l.name.padStart(10)).join('')}`;
    const rows = SLIM_LANE.steps
      .map(
        (_step, i) =>
          `  ${LANES[1].steps[i].label.padEnd(34)}${LANES.map((l) => String(deltas.get(l.name)![i]).padStart(10)).join('')}`
      )
      .join('\n');
    const totals = `  ${'TOTAL'.padEnd(34)}${LANES.map((l) => String(total(l)).padStart(10)).join('')}`;
    // eslint-disable-next-line no-console
    console.log(`net instantiations by model-declaration approach:\n${header}\n${rows}\n${totals}`);
  });

  afterAll(() => {
    writeComparisonReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      lanes: LANES.map(
        (lane): LaneReport => ({
          name: lane.name,
          steps: lane.steps.map((step, i) => ({
            step: i + 1,
            label: step.label.replace(/^\d+ \+? ?/, ''),
            delta: deltas.get(lane.name)![i],
            budget: step.budget,
          })),
          total: total(lane),
        })
      ),
    });
  });

  for (const lane of ALTERNATIVE_LANES) {
    for (let i = 0; i < lane.steps.length; i++) {
      const step = lane.steps[i];
      it(`${lane.name}: ${step.label} stays within its budget`, () => {
        expect(
          deltas.get(lane.name)![i],
          `"${step.label}" in the ${lane.name} lane added ${deltas.get(lane.name)![i]} net instantiations, over its budget of ${step.budget}`
        ).toBeLessThanOrEqual(step.budget);
      });
    }

    // Without this a lane could look cheap simply by having lost the formats
    // somewhere, which would make its whole column meaningless.
    it(`${lane.name}: the row still carries the refined formats`, () => {
      const result = lane.measure(laneSnippetUpTo(lane, lane.steps.length - 1) + lane.shapePins);
      expect(result.errors, `${lane.name} shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
    });
  }

  // Steps 4 and 5 are the same text in every lane, so their deltas should stay
  // close. A wide gap means a lane's model type reaches the router or the client
  // differently, and the comparison above would be measuring that instead of the
  // declaration style. Not zero though: the three lanes hand the router
  // structurally equivalent but differently SPELLED types (the builder lane's
  // readonly params). The threshold sits above today's spread to catch drift,
  // not to pin the current gap.
  it('the shared route and client steps cost about the same in every lane', () => {
    for (const stepIndex of [3, 4]) {
      const costs = LANES.map((lane) => deltas.get(lane.name)![stepIndex]);
      const spread = (Math.max(...costs) - Math.min(...costs)) / Math.min(...costs);
      expect(
        spread,
        `step ${stepIndex + 1} costs ${costs.join(' / ')} across ${LANES.map((l) => l.name).join(' / ')} — the shared steps drifted apart`
      ).toBeLessThan(0.3);
    }
  });
});
