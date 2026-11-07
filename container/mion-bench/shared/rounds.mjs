/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// How a lane is measured in rounds, and how its rounds become one published number.
//
// One long window per app let a short slowdown on the machine (a noisy neighbour, a GC
// burst on the host) land on one app's whole measurement: unchanged competitors moved
// 10-15% between deploys. So every lane is measured in short rounds, every app takes its
// turn in each round before any app gets the next one, and the page shows the MEDIAN
// round. A slowdown now costs one round of a few apps, and the median drops it.
//
// Pure functions only: the driver (host) and the harness (container) both import this.

import {join} from 'node:path';

// Request rates measured on 4 vCPU boxes (the deploy runner and a cloud sandbox), slowest
// to fastest app, and what a round of that length collects:
//   hello-world .. ~1 KB  10,000-140,000 req/s -> 5 s is 50,000+ requests
//   ~50 KB                1,500-3,500 req/s    -> 5 s is 7,500+
//   ~500 KB               180-410 req/s        -> 5 s is 1,500+ (measured 1,550-3,500)
//   ~4 MB                 20-40 req/s          -> 5 s would be ~100, and each request takes
//                         ~1 s at its 25 connections, so the window would end mid-request on
//                         most sockets. 10 s rounds collect 200-400 (15 s collected 300-600
//                         with a 3-14% spread). Three rounds, not four, so the lane costs
//                         39 s rather than the 25 s of the old single window plus another 20.
export const DEFAULT_PLAN = {rounds: 4, seconds: 5};
export const SIZE_PLANS = {
  small: DEFAULT_PLAN,
  medium: DEFAULT_PLAN,
  large: DEFAULT_PLAN,
  huge: {rounds: 3, seconds: 10},
};
// Round 1 warms a cold server. Later rounds restart it too, but the machine, the page
// cache and the image layers are already warm, so a shorter warm-up is enough.
export const DEFAULT_WARMUP = 5;
const DEFAULT_REWARMUP = 2;

/**
 * The rounds a lane runs and how long each lasts. `overrides` holds the knobs a user set
 * (rounds, seconds, warmup, rewarmup); a set one wins over the per-size default.
 */
export function planFor(sizeKey, overrides = {}) {
  const base = (sizeKey && SIZE_PLANS[sizeKey]) || DEFAULT_PLAN;
  const pick = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  return {
    rounds: pick(overrides.rounds, base.rounds),
    seconds: pick(overrides.seconds, base.seconds),
    warmup: pick(overrides.warmup, DEFAULT_WARMUP),
    rewarmup: pick(overrides.rewarmup, DEFAULT_REWARMUP),
  };
}

/** Warm-up seconds before round `round` (1-based). */
export const warmupFor = (plan, round) => (round === 1 ? plan.warmup : plan.rewarmup);

/**
 * The order the apps run in for one round: the list rotated, by a step that spreads every
 * app across the positions, so no app is always first (cold box) or last.
 */
export function roundOrder(items, round, rounds) {
  const count = items.length;
  if (count === 0) return [];
  const step = Math.max(1, Math.floor(count / Math.max(1, rounds)));
  const offset = ((round - 1) * step) % count;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/**
 * Every run of a whole benchmark, in order. Round by round: each lane (suite or sweep size)
 * runs every app, so the rounds of one lane sit as far apart in time as the run allows.
 * `last` marks a lane's final round, the moment its rounds can be merged.
 */
export function schedule(lanes, apps) {
  const steps = [];
  const most = Math.max(0, ...lanes.map((lane) => lane.plan.rounds));
  for (let round = 1; round <= most; round++) {
    for (const lane of lanes) {
      if (round > lane.plan.rounds) continue;
      for (const app of roundOrder(apps, round, lane.plan.rounds)) steps.push({round, lane, app, last: round === lane.plan.rounds});
    }
  }
  return steps;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** How far apart the rounds landed, as a percentage of the best one. */
export function spreadPct(values) {
  const best = Math.max(...values);
  return best > 0 ? ((best - Math.min(...values)) / best) * 100 : 0;
}

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * One published record from a lane's round records: every rate and latency is the median
 * round's, the error counts add up, and each round's own numbers stay on the record so a
 * page can show how far apart they landed.
 */
export function mergeRounds(records, {tolerance}) {
  if (records.length === 0) throw new Error('mergeRounds: no rounds to merge');
  const sorted = [...records].sort((a, b) => a.round - b.round);
  const medianOf = (read) => median(sorted.map(read));
  const rates = sorted.map((record) => record.requests.mean);
  const middle = medianOf((record) => record.requests.mean);
  // The per-second memory series is one round's, not a blend: the round nearest the median rate.
  const typical = sorted.reduce((best, record) =>
    Math.abs(record.requests.mean - middle) < Math.abs(best.requests.mean - middle) ? record : best
  );
  const sum = (read) => sorted.reduce((total, record) => total + read(record), 0);
  const {round: _round, warmup: _warmup, gc: _gc, ...base} = typical;
  return {
    ...base,
    requests: {mean: middle, stddev: medianOf((record) => record.requests.stddev)},
    latency: {mean: medianOf((record) => record.latency.mean), p99: medianOf((record) => record.latency.p99)},
    throughput: {mean: medianOf((record) => record.throughput.mean)},
    maxMem: medianOf((record) => record.maxMem),
    maxCpu: medianOf((record) => record.maxCpu),
    peakRss: sorted.every((record) => record.peakRss) ? medianOf((record) => record.peakRss) : null,
    errors: sum((record) => record.errors),
    non2xx: sum((record) => record.non2xx),
    timeouts: sum((record) => record.timeouts),
    requestsTotal: sum((record) => record.requestsTotal),
    rounds: sorted.map((record) => ({
      round: record.round,
      warmup: record.warmup,
      requests: record.requests.mean,
      latency: record.latency.mean,
      requestsTotal: record.requestsTotal,
    })),
    spread: round2(spreadPct(rates)),
    tolerance,
  };
}

/** Where a lane's records live: `<suite>/` or `payload-sizes/<size>/`. */
export const laneDir = (resultsDir, {suite, size}) => (size ? join(resultsDir, 'payload-sizes', size) : join(resultsDir, suite));

/** One round's record. A subdirectory, so the site generator (which reads files only) never sees it. */
export const roundFile = (dir, app, round) => join(dir, 'rounds', `${app}.r${round}.json`);
