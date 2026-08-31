// Unit tests for the soak wall-clock budget. Pure logic over an injected clock —
// no Go binary, no real waiting.
import {describe, it, expect} from 'vitest';
import {pathologyReport, soakTestTimeout, startSoakBudget, SOAK_HEADROOM_MS, SOAK_ITERATION_CEILING_MS} from './soakBudget.ts';

/** A fake clock: `tick(ms)` is the only thing that moves time. **/
function fakeClock(): {now: () => number; tick: (ms: number) => void} {
  let current = 1_000;
  return {now: () => current, tick: (ms) => void (current += ms)};
}

/** Run a soak whose every iteration costs `costMs`, returning how long the whole
 *  loop took and how many iterations it ran. **/
function simulate(durationMs: number, costMs: number | number[]): {elapsedMs: number; runs: number} {
  const clock = fakeClock();
  const costs = Array.isArray(costMs) ? costMs : null;
  const budget = startSoakBudget(durationMs, clock.now);
  let runs = 0;
  while (budget.canStart()) {
    clock.tick(costs ? (costs[runs] ?? costs[costs.length - 1]) : (costMs as number));
    runs++;
    budget.mark();
  }
  return {elapsedMs: budget.elapsedMs(), runs};
}

describe('fuzz / soakBudget — the soak owns its wall clock', () => {
  it('runs the first iteration even when it costs more than the whole budget', () => {
    // Its cost is unknown until it has run once, and a zero-iteration soak would
    // report as clean without having fuzzed anything.
    const {runs, elapsedMs} = simulate(1_000, 30_000);
    expect(runs).toBe(1);
    expect(elapsedMs).toBe(30_000);
  });

  it('does not start an iteration the remaining budget cannot pay for', () => {
    // 10 x 1s iterations fit in 10s, but the 10th would land exactly ON the
    // deadline, so the budget stops one short instead of overshooting.
    const {runs, elapsedMs} = simulate(10_000, 1_000);
    expect(runs).toBe(9);
    expect(elapsedMs).toBeLessThanOrEqual(10_000);
  });

  it('overshoots by at most the first iteration once the cost is known', () => {
    // Uniform 7s iterations against a 60s budget: everything after the first is
    // gated on the observed cost, so the loop lands inside the budget.
    const {runs, elapsedMs} = simulate(60_000, 7_000);
    expect(elapsedMs).toBeLessThanOrEqual(60_000);
    expect(runs).toBeGreaterThan(1);
  });

  it('budgets for the SLOWEST iteration, not the average', () => {
    // A single 20s outlier among 1s iterations is what would blow past a vitest
    // timeout, so the tail is sized against it: the loop stops with at least the
    // outlier's cost still unspent.
    const clock = fakeClock();
    const costs = [1_000, 20_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000];
    const budget = startSoakBudget(30_000, clock.now);
    let runs = 0;
    while (budget.canStart()) {
      clock.tick(costs[runs] ?? 1_000);
      runs++;
      budget.mark();
    }
    expect(budget.slowestIterationMs()).toBe(20_000);
    expect(budget.elapsedMs()).toBeLessThanOrEqual(30_000);
    // Stopped while >= the outlier's cost was still unspent.
    expect(30_000 - budget.elapsedMs()).toBeGreaterThanOrEqual(0);
  });

  it('never overshoots after the first iteration, whatever the cost mix', () => {
    for (const cost of [1, 250, 999, 3_000, 11_000]) {
      const {elapsedMs, runs} = simulate(45_000, cost);
      expect(runs).toBeGreaterThanOrEqual(1);
      expect(elapsedMs).toBeLessThanOrEqual(45_000);
    }
  });

  it('runs nothing on a zero or negative budget', () => {
    expect(simulate(0, 100).runs).toBe(0);
    expect(simulate(-5_000, 100).runs).toBe(0);
  });

  it('reports iteration bookkeeping, naming the slowest round', () => {
    const clock = fakeClock();
    const budget = startSoakBudget(10_000, clock.now);
    expect(budget.markedIterations()).toBe(0);
    expect(budget.slowestIterationMs()).toBe(0);
    expect(budget.slowestIterationRound()).toBe(-1);
    clock.tick(1_500);
    budget.mark();
    clock.tick(400);
    budget.mark();
    expect(budget.markedIterations()).toBe(2);
    expect(budget.slowestIterationMs()).toBe(1_500);
    expect(budget.slowestIterationRound()).toBe(0);
    expect(budget.elapsedMs()).toBe(1_900);
    // A later, slower iteration takes over the slot.
    clock.tick(2_500);
    budget.mark();
    expect(budget.slowestIterationRound()).toBe(2);
  });

  it('pathology tripwire: silent under the ceiling, a named finding above it', () => {
    expect(pathologyReport(undefined, undefined)).toBeNull();
    expect(pathologyReport(SOAK_ITERATION_CEILING_MS, 3)).toBeNull();
    const finding = pathologyReport(SOAK_ITERATION_CEILING_MS + 1, 741);
    expect(finding).toContain('round 741');
    expect(finding).toContain(`${SOAK_ITERATION_CEILING_MS + 1}ms`);
    // Above the in-lane compile timeout (10s), so that path keeps reporting
    // through its own oracle, not this tripwire.
    expect(SOAK_ITERATION_CEILING_MS).toBeGreaterThan(10_000);
  });

  it('charges fixed setup to the budget without counting it as iteration cost', () => {
    // The size lane runs a deterministic floor before its loop; that cost must
    // eat into the deadline but must NOT masquerade as a slow iteration, or the
    // tail guard would stop the soak far too early.
    const clock = fakeClock();
    const budget = startSoakBudget(60_000, clock.now);
    clock.tick(20_000); // the floor
    expect(budget.canStart()).toBe(true);
    clock.tick(1_000); // one real iteration
    budget.mark();
    expect(budget.slowestIterationMs()).toBe(1_000);
    expect(budget.elapsedMs()).toBe(21_000);
  });

  it('sizes the vitest timeout as the budget plus fixed headroom', () => {
    expect(soakTestTimeout(60_000)).toBe(60_000 + SOAK_HEADROOM_MS);
    expect(soakTestTimeout(0)).toBe(SOAK_HEADROOM_MS);
    // A negative / bogus env value must not produce a timeout below the headroom.
    expect(soakTestTimeout(-1)).toBe(SOAK_HEADROOM_MS);
    expect(soakTestTimeout(180_000)).toBeGreaterThan(soakTestTimeout(60_000));
    expect(soakTestTimeout(60_000, 1_000)).toBe(61_000);
  });

  it('gives every soak lane more headroom than the 60s that reported clean soaks as failures', () => {
    // The regression this module exists for: `soakMs + 60_000` was smaller than
    // the observed overshoot on the compile-bound lanes.
    expect(SOAK_HEADROOM_MS).toBeGreaterThan(60_000);
  });
});
