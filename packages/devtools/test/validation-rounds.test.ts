import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
// @ts-expect-error untyped .mjs
import * as rounds from '../../../scripts/website/bench-data/validation-rounds.mjs';
// @ts-expect-error untyped .mjs
import * as driver from '../../../scripts/website/bench-data/bench.mjs';

const {
  DEFAULT_ROUNDS,
  DEFAULT_ROUND_MS,
  mergeValidationRounds,
  roundsEnv,
  validationPlan,
  validationRoundFile,
  validationSchedule,
} = rounds;
const {clearResultFiles, runValidationRounds} = driver;

describe('validationPlan', () => {
  it('runs 3 rounds of 50 ms: shorter windows read low', () => {
    expect(validationPlan({})).toEqual({rounds: DEFAULT_ROUNDS, timeMs: DEFAULT_ROUND_MS});
    expect([DEFAULT_ROUNDS, DEFAULT_ROUND_MS]).toEqual([3, 50]);
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

describe('roundsEnv', () => {
  it('gives runs that publish no timing one round, unless the user set a count', () => {
    for (const env of [
      {MION_VALIDATION_BENCH_QUICK: '1'},
      {MION_VALIDATION_BENCH_NO_TIMING: '1'},
      {MION_VALIDATION_BENCH_CASE: 'OBJECT'},
    ])
      expect(roundsEnv(env), JSON.stringify(env)).toEqual({MION_VALIDATION_BENCH_ROUNDS: '1'});
    expect(roundsEnv({MION_VALIDATION_BENCH_QUICK: '1', MION_VALIDATION_BENCH_ROUNDS: '3'})).toEqual({});
    expect(roundsEnv({})).toEqual({});
  });
});

describe('runValidationRounds', () => {
  let dir: string;
  afterEach(() => rmSync(dir, {recursive: true, force: true}));
  const resultsDir = (runtime: string) => (runtime === 'node' ? dir : join(dir, runtime));

  /** Stands in for the container: writes the round result the harness would, then reports the exit. */
  function fake(outcome: (competitor: string, round: number) => 'ok' | 'errored' | 'no-start') {
    const calls: string[] = [];
    const runRound = (lane: {competitor: string; runtime: string}, round: number, timeMs: number) => {
      calls.push(`${lane.competitor}.${lane.runtime}.${round}@${timeMs}`);
      const what = outcome(lane.competitor, round);
      if (what === 'no-start') return false;
      const file = validationRoundFile(resultsDir(lane.runtime), lane.competitor, round);
      mkdirSync(dirname(file), {recursive: true});
      writeFileSync(file, JSON.stringify({...result(round, ok(100 + round), ok(1)), competitor: lane.competitor}));
      return what === 'ok';
    };
    return {calls, runRound};
  }
  const canonical = (competitor: string) => join(dir, `${competitor}.json`);

  it('merges every lane that ran, including one with errored cases, and stops one that never started', () => {
    dir = mkdtempSync(join(tmpdir(), 'mion-vrounds-'));
    const {calls, runRound} = fake((competitor, round) =>
      competitor === 'zod' && round === 2 ? 'errored' : competitor === 'ajv' && round === 1 ? 'no-start' : 'ok'
    );
    const broken = runValidationRounds(['mion', 'zod', 'ajv'], {runRound, withBun: false, resultsDir, env: {}});
    expect(broken.sort()).toEqual(['ajv', 'zod']);
    expect(calls.filter((call) => call.startsWith('ajv'))).toEqual(['ajv.node.1@50']);
    expect(existsSync(canonical('ajv'))).toBe(false);
    for (const competitor of ['mion', 'zod']) expect(JSON.parse(readFileSync(canonical(competitor), 'utf8')).env.rounds).toBe(3);
  });

  it('an inspection run merges nothing and runs one round', () => {
    dir = mkdtempSync(join(tmpdir(), 'mion-vrounds-'));
    const {calls, runRound} = fake(() => 'ok');
    const env = {MION_VALIDATION_BENCH_CASE: 'OBJECT', ...roundsEnv({MION_VALIDATION_BENCH_CASE: 'OBJECT'})};
    runValidationRounds(['mion'], {runRound, withBun: true, resultsDir, env});
    expect(calls).toEqual(['mion.node.1@50', 'mion.bun.1@50']);
    expect(existsSync(canonical('mion'))).toBe(false);
  });
});

describe('clearResultFiles', () => {
  it("removes a competitor's result and its rounds in every runtime dir, and nobody else's", () => {
    const dir = mkdtempSync(join(tmpdir(), 'mion-vclear-'));
    const files = [
      'zod.json',
      'mion.json',
      'rounds/zod.r1.json',
      'rounds/mion.r1.json',
      'bun/zod.json',
      'bun/rounds/zod.r3.json',
      'bun/rounds/mion.r2.json',
    ];
    for (const file of files) {
      mkdirSync(dirname(join(dir, file)), {recursive: true});
      writeFileSync(join(dir, file), '{}');
    }
    clearResultFiles([dir, join(dir, 'bun')], (file: string) => file === 'zod.json');
    expect(files.filter((file) => existsSync(join(dir, file)))).toEqual([
      'mion.json',
      'rounds/mion.r1.json',
      'bun/rounds/mion.r2.json',
    ]);
    rmSync(dir, {recursive: true, force: true});
  });
});

describe('the harness files a round where the driver reads it', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('MION_VALIDATION_BENCH_ROUND sends the result to rounds/<name>.r<n>.json, bun under bun/', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mion-vharness-'));
    vi.stubEnv('MION_VALIDATION_BENCH_RESULTS_DIR', dir);
    vi.resetModules();
    const {writeResult} = await import('../../../container/benchmarks/shared/harness/result.ts');
    const write = (runtime: 'node' | 'bun', round?: number) =>
      writeResult({
        ...result(round ?? 0, ok(1), ok(1)),
        runtime,
        env: {node: 'v26', timeMs: 50, noTiming: false, ...(round ? {round} : {})},
      } as never);
    write('node', 2);
    write('bun', 3);
    write('node');
    expect(existsSync(validationRoundFile(dir, 'zod', 2))).toBe(true);
    expect(existsSync(validationRoundFile(join(dir, 'bun'), 'zod', 3))).toBe(true);
    expect(existsSync(join(dir, 'zod.json'))).toBe(true);
    rmSync(dir, {recursive: true, force: true});
  });
});
