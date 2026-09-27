// Per-STEP instantiation budgets for the model pipeline over the slim packages (see
// .claude/skills/drizzle-slim-schemas/ARCHITECTURE.md), per dialect: 1 slim table, 2 refineTableType, 3 the flat models,
// 4 a mion route api, 5 initClient's mapping, 6 the db query through toDrizzle (the ONE step paying drizzle's generics).
// Nothing else catches a checker-cost regression, ours or a drizzle upgrade's. Snippets compile CUMULATIVELY; each
// step's DELTA is budgeted, plus the chain TOTAL, since deltas cannot see work moving between layers. Budgets are set
// BY HAND and ONE-WAY DOWNWARD: a delta that went down becomes the budget, one that went up is a regression to fix,
// never a budget to raise; an unavoidable raise is a REVIEWED EXCEPTION commented at the budget and called out in the
// PR. Counts are deterministic because typescript and drizzle-orm are exact-pinned; bumping either re-baselines every
// step. When a budget trips, `tsc --generateTrace` plus `@typescript/analyze-trace` name the types that cost.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PIPELINE_DIALECTS, measureConsumerLane, snippetUpTo, type ConsumerLaneResult} from './modelPipelineHarness.ts';
import {writeReport, type DialectPipelineReport} from './report.ts';

// drizzle-orm's exports map hides ./package.json, so read the version from our own exact pin.
const drizzleVersion: string = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  .dependencies['drizzle-orm'];

interface Measured {
  /** Net instantiations of each cumulative snippet, indexed by step. **/
  cumulative: number[];
  /** What each step ADDED over the step before it, the budgeted metric. **/
  deltas: number[];
  /** The downstream lane: what a consumer pays reading the emitted `.d.ts`. **/
  consumer: ConsumerLaneResult;
}
const measured = new Map<string, Measured>();

describe('model pipeline, type-instantiation budgets', () => {
  // The reports are committed, so a cost change nobody accounted for shows up as
  // a diff in the pull request rather than only in a console line nobody read.
  afterAll(() => {
    if (measured.size !== PIPELINE_DIALECTS.length) return;
    writeReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      dialects: PIPELINE_DIALECTS.map((pipeline): DialectPipelineReport => {
        const {cumulative, deltas, consumer} = measured.get(pipeline.dialect)!;
        return {
          dialect: pipeline.dialect,
          steps: pipeline.steps.map((step, i) => ({
            step: i + 1,
            label: step.label.replace(/^\d+ \+? ?/, ''),
            delta: deltas[i],
            budget: step.budget,
            cumulative: cumulative[i],
          })),
          totalBudget: pipeline.totalBudget,
          consumer: {
            budget: pipeline.consumerBudget,
            netInstantiations: consumer.netInstantiations,
            keepsGenericAlias: consumer.keepsGenericAlias,
            dtsBytes: consumer.dts.length,
          },
        };
      }),
    });
  });

  for (const pipeline of PIPELINE_DIALECTS) {
    const {dialect, steps} = pipeline;
    const get = () => measured.get(dialect)!;

    describe(dialect, () => {
      beforeAll(() => {
        const cumulative: number[] = [];
        const deltas: number[] = [];
        let previous = 0;
        for (let i = 0; i < steps.length; i++) {
          const result = pipeline.measure(snippetUpTo(pipeline, i));
          expect(
            result.errors,
            `${dialect} step "${steps[i].label}" should type-check cleanly:\n  ${result.errors.join('\n  ')}`
          ).toEqual([]);
          cumulative.push(result.netInstantiations);
          deltas.push(result.netInstantiations - previous);
          previous = result.netInstantiations;
        }
        measured.set(dialect, {cumulative, deltas, consumer: measureConsumerLane(pipeline)});
        const table = steps
          .map(
            (step, i) =>
              `  ${step.label.padEnd(24)} delta=${String(deltas[i]).padStart(6)}  budget=${String(step.budget).padStart(6)}  cumulative=${cumulative[i]}`
          )
          .join('\n');
        // eslint-disable-next-line no-console
        console.log(
          `${dialect}: net instantiations per pipeline step:\n${table}\n  consumer=${get().consumer.netInstantiations}`
        );
      });

      describe('per-step budget', () => {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          it(`${dialect}: ${step.label} stays within its budget`, () => {
            const delta = get().deltas[i];
            expect(
              delta,
              `${dialect} "${step.label}" added ${delta} net instantiations, over its budget of ${step.budget}, a type-cost regression in that layer`
            ).toBeLessThanOrEqual(step.budget);
          });
        }

        it(`${dialect}: the whole chain stays within its total budget`, () => {
          const total = get().cumulative[steps.length - 1];
          expect(
            total,
            `${dialect}: the whole chain cost ${total} net instantiations, over its total budget of ${pipeline.totalBudget}`
          ).toBeLessThanOrEqual(pipeline.totalBudget);
        });

        // Unresolved imports make every type `any` and the ratchet pass on nothing; these only compile with real formats.
        it(`${dialect}: the chain resolves to real formats, not any`, () => {
          const result = pipeline.measure(snippetUpTo(pipeline, steps.length - 1) + pipeline.shapePins);
          expect(result.errors, `${dialect} shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
        });
      });

      // A consumer reads the `.d.ts`, whose cost moves apart from the source figure, so it has its own budget.
      describe('downstream consumer budget', () => {
        it(`${dialect}: the models declaration emits cleanly and the consumer compiles`, () => {
          const {consumer} = get();
          expect(consumer.errors, `${dialect} consumer lane failed:\n  ${consumer.errors.join('\n  ')}`).toEqual([]);
          expect(consumer.dts.length).toBeGreaterThan(0);
        });

        // Declaration emit prints the alias, so the consumer evaluates the chain; if this flips, re-derive its budget.
        it(`${dialect}: the emitted declaration hands the consumer an unresolved generic`, () => {
          expect(get().consumer.keepsGenericAlias).toBe(true);
        });

        it(`${dialect}: the consumer stays within its budget`, () => {
          const cost = get().consumer.netInstantiations;
          expect(
            cost,
            `${dialect}: a consumer reading the emitted .d.ts pays ${cost} net instantiations, over its budget of ${pipeline.consumerBudget}`
          ).toBeLessThanOrEqual(pipeline.consumerBudget);
        });
      });
    });
  }
});
