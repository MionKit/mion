// The round scheduling and merge behind `bench servers` (container/mion-bench/shared/rounds.mjs)
// and the quick / --rounds knobs the driver turns into a plan (scripts/website/bench-data/mion-bench.mjs).
import {describe, expect, it} from 'vitest';
// Plain ESM dev scripts, no types: one directive per import line.
// @ts-expect-error untyped .mjs
import {
  DEFAULT_PLAN,
  SIZE_PLANS,
  median,
  mergeRounds,
  planFor,
  roundFile,
  roundOrder,
  schedule,
  spreadPct,
  warmupFor,
} from '../../../container/mion-bench/shared/rounds.mjs';
// @ts-expect-error untyped .mjs
import {lanePlan, quickEnv} from '../../../scripts/website/bench-data/mion-bench.mjs';
// @ts-expect-error untyped .mjs
import {SWEEP_SIZES} from '../../../container/mion-bench/shared/payloads.mjs';
// @ts-expect-error untyped .mjs
import {roundsProblem} from '../../../scripts/website/check-static.mjs';

const APPS = [
  'mion',
  'mion.uws',
  'mion.bun',
  'mion.compact',
  'http-node',
  'fastify',
  'express',
  'hapi',
  'hono',
  'hono.bun',
  'elysia.bun',
];

describe('roundOrder', () => {
  it('runs every app once per round', () => {
    for (let round = 1; round <= 4; round++) expect([...roundOrder(APPS, round, 4)].sort()).toEqual([...APPS].sort());
  });

  it('starts each round on a different app, so no app is always first or last', () => {
    const orders = [1, 2, 3, 4].map((round) => roundOrder(APPS, round, 4));
    expect(new Set(orders.map((order) => order[0])).size).toBe(4);
    expect(new Set(orders.map((order) => order.at(-1))).size).toBe(4);
  });

  it('is deterministic and keeps round 1 in registry order', () => {
    expect(roundOrder(APPS, 1, 4)).toEqual(APPS);
    expect(roundOrder(APPS, 3, 4)).toEqual(roundOrder(APPS, 3, 4));
  });

  it('never runs one app twice in a row across a round boundary', () => {
    const run = [1, 2, 3, 4].flatMap((round) => roundOrder(APPS, round, 4));
    for (let i = 1; i < run.length; i++) expect(run[i], `position ${i}`).not.toBe(run[i - 1]);
  });

  it('copes with one app and with more rounds than apps', () => {
    expect(roundOrder(['mion'], 3, 4)).toEqual(['mion']);
    expect(roundOrder(['a', 'b'], 2, 4)).toEqual(['b', 'a']);
    expect(roundOrder([], 1, 4)).toEqual([]);
  });
});

describe('schedule', () => {
  const lanes = [
    {key: 'hello-world', plan: planFor(undefined)},
    {key: 'huge', plan: planFor('huge')},
  ];
  const steps = schedule(lanes, APPS);

  it('runs every lane its own number of rounds, every app in each', () => {
    for (const lane of lanes) {
      const ofLane = steps.filter((step: {lane: {key: string}}) => step.lane.key === lane.key);
      expect(ofLane).toHaveLength(lane.plan.rounds * APPS.length);
      expect(ofLane.filter((step: {last: boolean}) => step.last)).toHaveLength(APPS.length);
    }
  });

  it('finishes a round across every lane before the next round starts', () => {
    const rounds = steps.map((step: {round: number}) => step.round);
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
  });

  it('never runs one app twice in a row', () => {
    for (let i = 1; i < steps.length; i++) expect(steps[i].app, `step ${i}`).not.toBe(steps[i - 1].app);
  });
});

describe('median and spread', () => {
  it('takes the middle value, or the mean of the two middle ones', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([40, 10, 30, 20])).toBe(25);
  });

  it('measures the spread against the best round, the way repeat always has', () => {
    expect(spreadPct([90, 100, 95])).toBeCloseTo(10);
    expect(spreadPct([0, 0])).toBe(0);
  });
});

describe('planFor', () => {
  it('gives the request-rate lanes 4 rounds of 5 s, warmed 5 s then 2 s', () => {
    const plan = planFor(undefined);
    expect(plan).toEqual({rounds: 4, seconds: 5, warmup: 5, rewarmup: 2});
    expect([1, 2, 3, 4].map((round) => warmupFor(plan, round))).toEqual([5, 2, 2, 2]);
  });

  it('gives the big payloads longer rounds, and every sweep size a plan', () => {
    for (const size of SWEEP_SIZES) expect(SIZE_PLANS[size.key], size.key).toBeDefined();
    expect(planFor('small')).toMatchObject(DEFAULT_PLAN);
    expect(planFor('huge').seconds).toBeGreaterThan(DEFAULT_PLAN.seconds);
    expect(planFor('huge').rounds).toBeLessThan(DEFAULT_PLAN.rounds);
  });

  it('lets a knob the user set win over the per-size default', () => {
    expect(planFor('huge', {rounds: 1, seconds: 3})).toMatchObject({rounds: 1, seconds: 3});
    expect(planFor('huge', {rounds: Number.NaN})).toMatchObject({rounds: SIZE_PLANS.huge.rounds});
  });
});

describe('the driver plan', () => {
  it('reads the MION_BENCH_* knobs, leaving the unset ones to the defaults', () => {
    expect(lanePlan(undefined, {})).toEqual(planFor(undefined));
    expect(
      lanePlan('huge', {MION_BENCH_ROUNDS: '2', MION_BENCH_DURATION: '7', MION_BENCH_WARMUP: '3', MION_BENCH_REWARMUP: '1'})
    ).toEqual({
      rounds: 2,
      seconds: 7,
      warmup: 3,
      rewarmup: 1,
    });
  });

  it('quick mode is one short round, and an explicit knob still wins', () => {
    expect(lanePlan('huge', quickEnv({}))).toMatchObject({rounds: 1, seconds: 3, warmup: 1});
    expect(lanePlan(undefined, quickEnv({MION_BENCH_ROUNDS: '3'}))).toMatchObject({rounds: 3, seconds: 3});
  });
});

const round = (n: number, mean: number, extra: Record<string, unknown> = {}) => ({
  app: 'mion',
  round: n,
  warmup: n === 1 ? 5 : 2,
  requests: {mean, stddev: mean / 10},
  latency: {mean: 1000 / mean, p99: 5000 / mean},
  throughput: {mean: mean * 100},
  maxMem: mean / 100,
  maxCpu: 100,
  peakRss: 1000 + n,
  memSeries: [n],
  errors: 0,
  non2xx: 0,
  timeouts: 0,
  requestsTotal: mean * 5,
  ...extra,
});

describe('mergeRounds', () => {
  const merged = mergeRounds([round(2, 110), round(1, 100), round(4, 60), round(3, 105)], {tolerance: 10});

  it('publishes the median round, so one slow round does not move the number', () => {
    expect(merged.requests.mean).toBe(102.5);
    expect(merged.latency.mean).toBeCloseTo(median([10, 1000 / 110, 1000 / 60, 1000 / 105]));
    expect(merged.maxMem).toBe(1.025);
  });

  it('keeps every round, in order, and the spread across them', () => {
    expect(merged.rounds.map((entry: {round: number}) => entry.round)).toEqual([1, 2, 3, 4]);
    expect(merged.rounds.map((entry: {requests: number}) => entry.requests)).toEqual([100, 110, 105, 60]);
    expect(merged.spread).toBeCloseTo(45.45, 1);
    expect(merged.tolerance).toBe(10);
  });

  it('adds up the request and error counts, and drops the per-round fields', () => {
    expect(merged.requestsTotal).toBe(375 * 5);
    expect(merged.errors).toBe(0);
    expect(merged).not.toHaveProperty('round');
    expect(merged).not.toHaveProperty('warmup');
    // the memory series is one real round's, the one nearest the median rate
    expect(merged.memSeries).toEqual([1]);
  });

  it('a single round is its own median with no spread', () => {
    const one = mergeRounds([round(1, 100)], {tolerance: 10});
    expect(one.requests.mean).toBe(100);
    expect(one.spread).toBe(0);
    expect(one.rounds).toHaveLength(1);
  });

  it('refuses an empty lane', () => {
    expect(() => mergeRounds([], {tolerance: 10})).toThrow(/no rounds/);
  });

  it('files rounds in a subdirectory the site generator never reads', () => {
    expect(roundFile('/r/hello-world', 'mion.uws', 2)).toBe('/r/hello-world/rounds/mion.uws.r2.json');
  });
});

describe('the deploy gate on a server dataset', () => {
  const row = (app: string, rounds: number[], spread: number | null = 2) => ({app, requests: 100, rounds, spread});

  it('passes rows that carry every round the meta says ran', () => {
    expect(roundsProblem([row('mion', [99, 100, 101, 102])], {rounds: 4})).toBeNull();
  });

  it('names a row missing its rounds or its spread', () => {
    expect(roundsProblem([row('mion', [100, 101]), row('hono', [1, 2, 3, 4])], {rounds: 4})).toMatch(/mion without 4 rounds/);
    expect(roundsProblem([row('hono', [1, 2, 3, 4], null)], {rounds: 4})).toMatch(/hono/);
  });

  it('asks nothing of a single-round dataset, and still wants a number on every row', () => {
    expect(roundsProblem([row('mion', [])], {rounds: 1})).toBeNull();
    expect(roundsProblem([{app: 'mion', requests: null}], {})).toMatch(/mion without a requests number/);
  });
});
