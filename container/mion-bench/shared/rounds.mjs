/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Short interleaved rounds per lane, published as the MEDIAN round: one long window per app let a short host
// slowdown land on one app's whole number (unchanged competitors moved 10-15% between deploys). Pure functions
// only: the driver (host) and the harness (container) both import this.

import {join} from 'node:path';

// On 4 vCPU boxes, 5 s rounds collect 1,500+ requests up to ~500 KB (180-410 req/s there, 10,000+ up to ~1 KB).
// ~4 MB runs 20-40 req/s at ~1 s per request, so 5 s would end mid-request on most sockets: 10 s collects 200-400.
// Three of those, not four, keeps the ~4 MB lane at 39 s.
export const DEFAULT_PLAN = {rounds: 4, seconds: 5};
export const SIZE_PLANS = {
  small: DEFAULT_PLAN,
  medium: DEFAULT_PLAN,
  large: DEFAULT_PLAN,
  huge: {rounds: 3, seconds: 10},
};
// Later rounds restart the server too, but the machine, page cache and image layers are warm: a shorter warm-up does.
export const DEFAULT_WARMUP = 5;
const DEFAULT_REWARMUP = 2;

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

/** The step spreads every app across the positions, so no app is always first (cold box) or last. */
export function roundOrder(items, round, rounds) {
  const count = items.length;
  if (count === 0) return [];
  const step = Math.max(1, Math.floor(count / Math.max(1, rounds)));
  const offset = ((round - 1) * step) % count;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/** Round-major, so one lane's rounds sit as far apart in time as the run allows; `last` = its rounds can merge. */
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

export function spreadPct(values) {
  const best = Math.max(...values);
  return best > 0 ? ((best - Math.min(...values)) / best) * 100 : 0;
}

const round2 = (value) => Math.round(value * 100) / 100;

/** Keeps each round's own numbers on the record so a page can show how far apart they landed. */
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

export const laneDir = (resultsDir, {suite, size}) => (size ? join(resultsDir, 'payload-sizes', size) : join(resultsDir, suite));

/** A subdirectory, so the site generator (which reads files only) never sees a round's record. */
export const roundFile = (dir, app, round) => join(dir, 'rounds', `${app}.r${round}.json`);
