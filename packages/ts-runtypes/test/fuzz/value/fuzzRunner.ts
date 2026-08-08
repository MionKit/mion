// Autonomous fuzz driver. Feeds three streams of data into every target's
// validation/serialization functions and collects oracle violations:
//
//   valid    createMockDataFn<T>()        → O1, O3, O4, O5, O6, O7
//   invalid  mutateToInvalid(valid)     → O2, O3, O4
//   junk     randomJunk() (type-blind)  → O3, O4
//
// Every iteration runs under a seeded `Math.random` (withSeededRandom), so a
// reported violation replays exactly from its `seed`. `runFuzz` is pure data
// in / report out — no test framework, no I/O — so it runs both inside Vitest
// and as a standalone long-running soak (see runFuzzForDuration).

import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {startSoakBudget} from '../core/soakBudget.ts';
import {mutateToInvalid} from './invalidValue.ts';
import {
  checkBinaryStable,
  checkErrorsAgree,
  checkInvalidRejected,
  checkJsonStable,
  checkValidAccepted,
  checkValidateTotal,
  type FuzzTarget,
  type Violation,
} from './fuzzOracle.ts';

export interface FuzzOptions {
  /** Base seed; the whole run is reproducible from this number. **/
  seed?: number;
  /** Iterations per target. **/
  iterations?: number;
}

export interface FuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: Violation[];
  /** Duration runs only: the slowest single iteration and its zero-based round,
   *  for the soak pathology tripwire (SOAK_ITERATION_CEILING_MS). **/
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

const DEFAULT_ITERATIONS = 200;

/** Run a fixed number of iterations per target and return all violations. **/
export function runFuzz(targets: FuzzTarget[], options: FuzzOptions = {}): FuzzReport {
  const seed = options.seed ?? 0x1234abcd;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const violations: Violation[] = [];
  let runs = 0;

  for (const target of targets) {
    for (let i = 0; i < iterations; i++) {
      const iterSeed = mixSeed(seed, target.title, i);
      withSeededRandom(iterSeed, () => {
        runs++;
        fuzzOneIteration(target, iterSeed, violations);
      });
    }
  }
  return {runs, iterations, seed, violations};
}

/** Soak mode: keep fuzzing until `durationMs` elapses, logging violations as
 *  they appear. Returns the accumulated report. Used by the standalone runner
 *  the user wants to "run autonomous for some time and log all found errors". **/
export function runFuzzForDuration(
  targets: FuzzTarget[],
  durationMs: number,
  options: FuzzOptions = {},
  onViolation?: (v: Violation) => void
): FuzzReport {
  const seed = options.seed ?? Date.now() >>> 0;
  const violations: Violation[] = [];
  let runs = 0;
  let round = 0;
  // One "iteration" is a full round over every target — the budget refuses to
  // start a round the remaining time cannot pay for, so the soak lands inside
  // its wall clock instead of overshooting by a whole round.
  const budget = startSoakBudget(durationMs);

  while (budget.canStart()) {
    for (const target of targets) {
      const iterSeed = mixSeed(seed, target.title, round);
      withSeededRandom(iterSeed, () => {
        runs++;
        const before = violations.length;
        fuzzOneIteration(target, iterSeed, violations);
        if (onViolation) for (let i = before; i < violations.length; i++) onViolation(violations[i]);
      });
    }
    round++;
    budget.mark();
  }
  return {
    runs,
    iterations: round,
    seed,
    violations,
    slowestIterationMs: budget.slowestIterationMs(),
    slowestIterationRound: budget.slowestIterationRound(),
  };
}

/** One target × one seed: valid, invalid, and junk passes. Runs INSIDE a
 *  `withSeededRandom` scope (mock + mutation + junk all draw seeded entropy). **/
function fuzzOneIteration(target: FuzzTarget, seed: number, out: Violation[]): void {
  // --- valid pass ---
  let valid: unknown;
  try {
    valid = target.mock();
  } catch (err) {
    // A mock generator throwing is itself a finding (e.g. `never` in a shape).
    out.push({
      oracle: 'O1',
      target: target.title,
      seed,
      phase: 'valid',
      message: `mock generation threw: ${err instanceof Error ? err.message : String(err)}`,
      value: '<mock-threw>',
    });
    return;
  }
  const validCtx = {seed, phase: 'valid' as const};
  push(out, checkValidAccepted(target, valid, validCtx));
  push(out, checkValidateTotal(target, valid, validCtx));
  push(out, checkErrorsAgree(target, valid, validCtx));
  push(out, checkJsonStable(target, valid, validCtx));
  push(out, checkBinaryStable(target, valid, validCtx));

  // --- invalid pass (metamorphic corruption of the valid mock) ---
  const mutated = mutateToInvalid(target.schema, valid, Math.random);
  if (mutated) {
    const invalidCtx = {seed, phase: 'invalid' as const};
    push(out, checkInvalidRejected(target, mutated.value, invalidCtx));
    push(out, checkValidateTotal(target, mutated.value, invalidCtx));
    push(out, checkErrorsAgree(target, mutated.value, invalidCtx));
  }

  // --- junk pass (type-blind random data; only robustness oracles apply) ---
  const junk = randomJunk(0);
  const junkCtx = {seed, phase: 'junk' as const};
  push(out, checkValidateTotal(target, junk, junkCtx));
  push(out, checkErrorsAgree(target, junk, junkCtx));
}

function push(out: Violation[], violation: Violation | null): void {
  if (violation) out.push(violation);
}

const JUNK_LEAVES: Array<() => unknown> = [
  () => 0,
  () => -1,
  () => 1.5,
  () => NaN,
  () => Infinity,
  () => '',
  () => 'a string',
  () => true,
  () => false,
  () => null,
  () => undefined,
  () => 9007199254740993n,
  () => Symbol('junk'),
  () => new Date(),
  () => new Date('invalid'),
  () => ({}),
  () => [],
  () => /regex/,
  () => new Map<unknown, unknown>([['k', 'v']]),
  () => new Set([1, 2, 3]),
  () => () => undefined,
];

/** A random, acyclic, type-blind value. Bounded depth so validators that
 *  recurse on structure can't be starved by an enormous junk tree, and never
 *  cyclic (which would be a separate, intentional hardening concern). **/
export function randomJunk(depth: number): unknown {
  if (depth >= 4 || Math.random() < 0.5) {
    return JUNK_LEAVES[Math.floor(Math.random() * JUNK_LEAVES.length)]();
  }
  if (Math.random() < 0.5) {
    const length = Math.floor(Math.random() * 4);
    const arr: unknown[] = [];
    for (let i = 0; i < length; i++) arr.push(randomJunk(depth + 1));
    return arr;
  }
  const keys = Math.floor(Math.random() * 4);
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < keys; i++) obj['k' + i] = randomJunk(depth + 1);
  return obj;
}
