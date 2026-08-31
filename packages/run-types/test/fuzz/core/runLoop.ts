// The ONE loop skeleton every generation lane runs on.
//
// Six runners used to hand-write the same six things: default the entry seed,
// derive each iteration's seed with `mixSeed`, run either a fixed count or a
// `startSoakBudget` wall clock, wrap the body in the crash guard, mark the
// budget, stream new violations, and assemble runs / rounds / slowest-iteration
// into the report. Nothing owned those invariants, so adopting the crash guard
// cost six near-identical edits and a future lane could silently ship without
// the guard or the budget discipline. Here they are owned in one place: a lane
// that calls `runFuzzLoop` gets all of them by construction.
//
// Deliberately NOT a framework. The lane keeps its own resources, stats,
// violation type and report — the helper hands it a round and a guarded step,
// and takes nothing else over. `withSeededRandom` in particular stays lane-side:
// only the value / cloning lanes wrap a whole iteration in it, the rest seed
// sub-streams inside their own bodies.
//
// A ROUND is the unit of budget: one `budget.mark()` per round, and the soak
// stops between rounds. A STEP is the unit of seeding and crash guarding. Most
// lanes run one step per round; the value and cloning lanes run one step per
// target inside a round, because their soak seed stream is
// `mixSeed(seed, target.title, round)` — the round is shared across targets.

import {mixSeed} from './seededRng.ts';
import {startCrashGuard, type CrashRecord, type CrashGuard} from './crashGuard.ts';
import {startSoakBudget, type SoakBudget} from './soakBudget.ts';

interface FuzzLoopCommon<V> {
  /** Entry seed. The whole run replays from this number. **/
  seed?: number;
  /** Entry seed when `seed` is absent. Omitted means `Date.now() >>> 0` — the
   *  soak default, where a fresh number is the point. **/
  defaultSeed?: number;
  /** Fixed-count mode: how many rounds to run. **/
  rounds?: number;
  /** Soak mode: wall-clock budget in ms. **/
  durationMs?: number;
  /** Injectable clock for the soak budget, so a lane's own tests need not burn
   *  real seconds. **/
  now?: () => number;
  /** The lane's violation sink. The loop only reads its length, to spot what a
   *  step appended; the lane still owns every push. **/
  violations?: readonly V[];
  /** Called with each violation a step appends, in order. **/
  onViolation?: (violation: V) => void;
}

export interface FuzzLoopOptions<V> extends FuzzLoopCommon<V> {
  /** Fixed work that must happen INSIDE the budget but OUTSIDE the crash guard:
   *  the binary lane's deterministic floor (its loud failure is the proof the
   *  resolver is reachable, so it must never be swallowed) and the elision
   *  lane's client + convert project. Runs once, before the first round. **/
  setup?: (seed: number) => void | Promise<void>;
}

export interface FuzzLoopOptionsSync<V> extends FuzzLoopCommon<V> {
  setup?: (seed: number) => void;
}

export interface FuzzLoopResult {
  /** The entry seed actually used — what a failing report tells the reader to
   *  replay with. **/
  seed: number;
  /** Guarded steps started. **/
  runs: number;
  /** Rounds completed. **/
  rounds: number;
  /** Hard failures captured by the crash guard, each with its step seed. **/
  crashes: CrashRecord[];
  /** Soak mode only: the slowest round and its zero-based index, for the
   *  pathology tripwire (`pathologyReport` in core/soakBudget.ts). **/
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

export interface FuzzRound {
  /** The entry seed (not the step seed — that is derived per `run`). **/
  readonly seed: number;
  /** Zero-based round index. **/
  readonly round: number;
  /** Run one crash-guarded step. Its seed is `mixSeed(seed, label, index)` and
   *  is handed to `body`, so the lane never re-derives it. **/
  run(label: string, index: number, body: (stepSeed: number) => Promise<void>): Promise<void>;
}

export interface FuzzRoundSync {
  readonly seed: number;
  readonly round: number;
  run(label: string, index: number, body: (stepSeed: number) => void): void;
}

/** The shared bookkeeping both loops drive. Owns the seed, the crash guard, the
 *  budget (soak) or the round ceiling (fixed), and the counters. **/
class LoopDriver<V> {
  readonly seed: number;
  readonly guard: CrashGuard = startCrashGuard();
  round = 0;
  private runsStarted = 0;
  private readonly budget: SoakBudget | undefined;
  private readonly roundCeiling: number;
  private readonly violations: readonly V[] | undefined;
  private readonly onViolation: ((violation: V) => void) | undefined;

  constructor(options: FuzzLoopCommon<V>) {
    const {rounds, durationMs} = options;
    if ((rounds === undefined) === (durationMs === undefined)) {
      throw new Error('runFuzzLoop needs exactly one of `rounds` (fixed count) or `durationMs` (soak)');
    }
    this.seed = (options.seed ?? options.defaultSeed ?? Date.now()) >>> 0;
    this.budget = durationMs === undefined ? undefined : startSoakBudget(durationMs, options.now);
    this.roundCeiling = rounds ?? 0;
    this.violations = options.violations;
    this.onViolation = options.onViolation;
  }

  canStart(): boolean {
    return this.budget ? this.budget.canStart() : this.round < this.roundCeiling;
  }

  /** Start a step: count it and snapshot the violation sink. **/
  beginStep(): number {
    this.runsStarted++;
    return this.violations ? this.violations.length : 0;
  }

  /** End a step: stream whatever it appended, in order. **/
  endStep(from: number): void {
    if (!this.onViolation || !this.violations) return;
    for (let i = from; i < this.violations.length; i++) this.onViolation(this.violations[i]);
  }

  endRound(): void {
    this.round++;
    this.budget?.mark();
  }

  stepSeed(label: string, index: number): number {
    return mixSeed(this.seed, label, index);
  }

  result(): FuzzLoopResult {
    const report: FuzzLoopResult = {seed: this.seed, runs: this.runsStarted, rounds: this.round, crashes: this.guard.crashes};
    if (this.budget) {
      report.slowestIterationMs = this.budget.slowestIterationMs();
      report.slowestIterationRound = this.budget.slowestIterationRound();
    }
    return report;
  }
}

/** Run an async lane's loop. `round` is called once per round and runs one or
 *  more guarded steps through the handle it receives. **/
export async function runFuzzLoop<V>(
  options: FuzzLoopOptions<V>,
  round: (handle: FuzzRound) => Promise<void>
): Promise<FuzzLoopResult> {
  const driver = new LoopDriver(options);
  await options.setup?.(driver.seed);
  const handle: FuzzRound = {
    seed: driver.seed,
    get round() {
      return driver.round;
    },
    async run(label, index, body) {
      const from = driver.beginStep();
      const stepSeed = driver.stepSeed(label, index);
      await driver.guard.run(stepSeed, () => body(stepSeed));
      driver.endStep(from);
    },
  };
  while (driver.canStart()) {
    await round(handle);
    driver.endRound();
  }
  return driver.result();
}

/** `runFuzzLoop` for the synchronous lanes (the compiled-fn value / cloning
 *  loops, which never await). **/
export function runFuzzLoopSync<V>(options: FuzzLoopOptionsSync<V>, round: (handle: FuzzRoundSync) => void): FuzzLoopResult {
  const driver = new LoopDriver(options);
  options.setup?.(driver.seed);
  const handle: FuzzRoundSync = {
    seed: driver.seed,
    get round() {
      return driver.round;
    },
    run(label, index, body) {
      const from = driver.beginStep();
      const stepSeed = driver.stepSeed(label, index);
      driver.guard.runSync(stepSeed, () => body(stepSeed));
      driver.endStep(from);
    },
  };
  while (driver.canStart()) {
    round(handle);
    driver.endRound();
  }
  return driver.result();
}
