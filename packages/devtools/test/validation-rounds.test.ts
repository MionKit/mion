// The validation benchmarks in interleaved rounds (scripts/website/bench-data/validation-rounds.mjs).
import {describe, expect, it} from 'vitest';
// @ts-expect-error untyped .mjs
import * as rounds from '../../../scripts/website/bench-data/validation-rounds.mjs';

const {DEFAULT_ROUNDS, DEFAULT_ROUND_MS, mergeValidationRounds, validationPlan, validationRoundFile, validationSchedule} = rounds;

describe('validationPlan', () => {
  it('runs 3 rounds of 50 ms: shorter windows read low', () => {
    expect(validationPlan({})).toEqual({rounds: 3, timeMs: 50});
    expect(DEFAULT_ROUND_MS).toBeGreaterThanOrEqual(50);
    expect(DEFAULT_ROUNDS).toBeGreaterThanOrEqual(3);
  });

  it('reads the knobs, and refuses one that would schedule no round', () => {
    expect(validationPlan({MION_VALIDATION_BENCH_ROUNDS: '1', MION_VALIDATION_BENCH_TIME_MS: '20'})).toEqual({
      rounds: 1,
      timeMs: 20,
    });
    for (const bad of ['0', '2.5', 'abc', 'missing'])
      expect(() => validationPlan({MION_VALIDATION_BENCH_ROUNDS: bad}), bad).toThrow(/ROUNDS/);
    expect(() => validationPlan({MION_VALIDATION_BENCH_TIME_MS: '-1'})).toThrow(/TIME_MS/);
  });
});

describe('validationSchedule', () => {
  const lanes = ['mion', 'zod', 'typebox', 'ajv', 'typia'];
  const steps: {round: number; lane: string}[] = validationSchedule(lanes, 4);

  it('runs every lane once per round, round after round', () => {
    expect(steps).toHaveLength(20);
    for (let round = 1; round <= 4; round++) {
      expect(
        steps
          .filter((step) => step.round === round)
          .map((step) => step.lane)
          .sort()
      ).toEqual([...lanes].sort());
    }
  });

  it('rotates the start so no lane always goes first', () => {
    const firsts = [1, 2, 3, 4].map((round) => steps.find((step) => step.round === round)!.lane);
    expect(new Set(firsts).size).toBe(4);
  });

  it('files a round beside the canonical result, where the results reader never looks', () => {
    expect(validationRoundFile('/r', 'zod', 3)).toBe('/r/rounds/zod.r3.json');
  });
});

type Metric = {status: string; validOpsSec: number; invalidOpsSec: number; mixedOpsSec: number; detail: string | null};
const ok = (valid: number): Metric => ({
  status: 'ok',
  validOpsSec: valid,
  invalidOpsSec: valid * 2,
  mixedOpsSec: valid * 1.5,
  detail: null,
});
const result = (round: number, validate: Metric, errors: Metric) => ({
  competitor: 'zod',
  generatedAt: `2026-11-07T00:00:0${round}Z`,
  runtime: 'node',
  skippedGroups: [],
  env: {node: 'v26', timeMs: 25, noTiming: false, round},
  cases: [{key: 'A.b', suite: 's', group: 'A', name: 'b', samplesOverridden: false, validate, validationErrors: errors}],
  summary: {
    total: 1,
    validate: {ok: 1, fail: 0, errored: 0, notSupported: 0},
    validationErrors: {ok: 1, fail: 0, errored: 0, notSupported: 0},
    fail: 0,
    errored: 0,
  },
});
const notSupported: Metric = {status: 'not-supported', validOpsSec: 0, invalidOpsSec: 0, mixedOpsSec: 0, detail: null};

describe('mergeValidationRounds', () => {
  const merged = mergeValidationRounds([
    result(2, ok(110), notSupported),
    result(1, ok(100), notSupported),
    result(4, ok(50), notSupported),
    result(3, ok(105), notSupported),
  ]);
  const metric = merged.cases[0].validate;

  it('publishes the median of every stream, so one slow round does not move a case', () => {
    expect(metric.validOpsSec).toBe(102.5);
    expect(metric.invalidOpsSec).toBe(205);
    expect(metric.mixedOpsSec).toBeCloseTo(153.75);
  });

  it('keeps each round, in order, and the widest spread of the three streams', () => {
    expect(metric.rounds.validOpsSec).toEqual([100, 110, 105, 50]);
    expect(metric.spread).toBeCloseTo(54.55, 1);
  });

  it('records the rounds and drops the per-round marker', () => {
    expect(merged.env).toEqual({node: 'v26', timeMs: 25, noTiming: false, rounds: 4});
    expect(merged.generatedAt).toBe('2026-11-07T00:00:04Z');
  });

  it('leaves a non-ok metric and the scoring counts as a single run had them', () => {
    expect(merged.cases[0].validationErrors).toEqual(notSupported);
    expect(merged.summary.validationErrors).toEqual({ok: 0, fail: 0, errored: 0, notSupported: 1});
    expect(merged.summary.validate.ok).toBe(1);
  });

  it('takes the worst status any round saw, so a flaky errored round is never hidden', () => {
    const errored: Metric = {status: 'errored', validOpsSec: 0, invalidOpsSec: 0, mixedOpsSec: 0, detail: 'boom'};
    const one = mergeValidationRounds([result(1, ok(100), ok(1)), result(2, errored, ok(1))]);
    expect(one.cases[0].validate).toEqual(errored);
    expect(one.summary.errored).toBe(1);
  });

  it('a single round has no per-round block and no spread', () => {
    const single = mergeValidationRounds([result(1, ok(100), ok(1))]);
    expect(single.cases[0].validate).toEqual(ok(100));
    expect(() => mergeValidationRounds([])).toThrow(/no rounds/);
  });
});
