// Per-STEP type-instantiation budget for the full model pipeline, over the
// SLIM architecture (.claude/skills/drizzle-slim-schemas/ARCHITECTURE.md):
//
//   1 slim table (formats included)  →  2 refineTableType  →  3 the flat
//   InferSelectModel/Insert/Update  →  4 a mion route api with RpcError unions
//   →  5 initClient's Result-tuple mapping  →  6 the db query through
//   toDrizzle (the ONE step that pays drizzle's generics)
//
// Nothing else measures what a layer costs the TypeScript checker, so a
// regression (ours, or a drizzle-orm upgrade) shows up only as every consumer's
// editor getting slower. This suite compiles the six snippets CUMULATIVELY
// through the real compiler against the real module graph and asserts each
// step's DELTA over the one before it. The deltas are the metric.
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
//
// The per-step deltas cannot see work MOVING between layers, so the chain also
// carries a TOTAL budget (PIPELINE_TOTAL_BUDGET, the cumulative figure after
// step 6). Both must hold: a change that cheapens the total is not licence to
// let a step drift, and a step staying inside its budget does not prove the
// chain got cheaper.
//
// The budgets were RE-BASELINED on 2026-08-28 when the packages moved from the
// drizzle-typed proxy builders to the slim recorder architecture: the model
// path (steps 1-3) fell from 11504 to about 2200 net instantiations and the
// drizzle generics now appear only in step 6, the db lane. The old drizzle-lane
// numbers live in git history; the ratchet is downward-only from here.
// Counts are deterministic because `typescript` and `drizzle-orm` are both
// exact-pinned; bumping either is the one event that re-baselines every step.
//
// ──────────────────── WHEN A BUDGET TRIPS ────────────────────
// These counters say WHICH layer got more expensive, never why. For the why,
// run `tsc --generateTrace <dir>` over a file exercising that layer and open the
// result with `@typescript/analyze-trace`; it names the individual types the
// checker spent its time on. The budget test itself deliberately stays cheap
// counters so it can run on every `pnpm test`.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  CONSUMER_BUDGET,
  PIPELINE_STEPS,
  PIPELINE_TOTAL_BUDGET,
  SHAPE_PINS,
  measureConsumerLane,
  measurePipeline,
  snippetUpTo,
  type ConsumerLaneResult,
} from './modelPipelineHarness.ts';
import {writeReport} from './report.ts';

// drizzle-orm does not expose ./package.json through its exports map, so take the
// version from our own exact pin — the same string the lockfile resolved.
const drizzleVersion: string = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  .dependencies['drizzle-orm'];

/** Net instantiations of each cumulative snippet, indexed by step. **/
const cumulative: number[] = [];
/** What each step ADDED over the step before it — the budgeted metric. **/
const deltas: number[] = [];
/** The downstream lane: what a consumer pays reading the emitted `.d.ts`. **/
let consumer: ConsumerLaneResult;

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
    consumer = measureConsumerLane();
    const table = PIPELINE_STEPS.map(
      (step, i) =>
        `  ${step.label.padEnd(24)} delta=${String(deltas[i]).padStart(6)}  budget=${String(step.budget).padStart(6)}  cumulative=${cumulative[i]}`
    ).join('\n');
    // eslint-disable-next-line no-console
    console.log(`net instantiations per pipeline step:\n${table}`);
  });

  // The reports are committed, so a cost change nobody accounted for shows up as
  // a diff in the pull request rather than only in a console line nobody read.
  afterAll(() => {
    writeReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      steps: PIPELINE_STEPS.map((step, i) => ({
        step: i + 1,
        label: step.label.replace(/^\d+ \+? ?/, ''),
        delta: deltas[i],
        budget: step.budget,
        cumulative: cumulative[i],
      })),
      totalBudget: PIPELINE_TOTAL_BUDGET,
      consumer: {
        budget: CONSUMER_BUDGET,
        netInstantiations: consumer.netInstantiations,
        keepsGenericAlias: consumer.keepsGenericAlias,
        dtsBytes: consumer.dts.length,
      },
    });
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

  it('the whole chain stays within its total budget', () => {
    const total = cumulative[cumulative.length - 1];
    expect(
      total,
      `the whole chain cost ${total} net instantiations, over its total budget of ${PIPELINE_TOTAL_BUDGET}`
    ).toBeLessThanOrEqual(PIPELINE_TOTAL_BUDGET);
  });

  // Without this the budgets are meaningless: if the workspace install is stale
  // and the imports fail to resolve, every type in the chain becomes `any`, the
  // deltas collapse, and a downward-only ratchet passes on a measurement of
  // nothing. These assertions only compile when the real formats came through.
  it('the chain resolves to real formats, not any', () => {
    const result = measurePipeline(snippetUpTo(PIPELINE_STEPS.length - 1) + SHAPE_PINS);
    expect(result.errors, `shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
  });
});

// A downstream project installs the package and reads its `.d.ts`, so its cost
// is NOT the source-compiled figure above and needs its own budget. The two move
// independently: a change can leave the source cost flat and still make every
// consumer's editor slower, or the reverse.
describe('model pipeline — downstream consumer budget', () => {
  it('the models declaration emits cleanly and the consumer compiles', () => {
    expect(consumer.errors, `consumer lane failed:\n  ${consumer.errors.join('\n  ')}`).toEqual([]);
    expect(consumer.dts.length).toBeGreaterThan(0);
  });

  // Pins today's reality rather than an aspiration. Declaration emit prints the
  // alias, not its value, so the consumer evaluates the chain themselves. If this
  // ever flips to false the consumer budget below is measuring something else and
  // must be re-derived, not merely re-seeded.
  it('the emitted declaration hands the consumer an unresolved generic', () => {
    expect(consumer.keepsGenericAlias).toBe(true);
  });

  it('the consumer stays within its budget', () => {
    expect(
      consumer.netInstantiations,
      `a consumer reading the emitted .d.ts pays ${consumer.netInstantiations} net instantiations, over its budget of ${CONSUMER_BUDGET}`
    ).toBeLessThanOrEqual(CONSUMER_BUDGET);
  });
});
