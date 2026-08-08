// Wall-clock budget for the opt-in soak lanes, and the vitest timeout that
// matches it.
//
// Every soak runner used to spell the same loop by hand:
//
//   const deadline = Date.now() + durationMs;
//   while (Date.now() < deadline) { await oneIteration(); }
//
// which only bounds when an iteration may START, never when it may END — so the
// run overshoots its budget by however long the last iteration takes. The soak
// tests then sized their vitest timeout as `soakMs + 60_000`, and a lane whose
// iterations cost more than that headroom reported a CLEAN soak as a vitest
// timeout failure (docs/done/fuzz-followups.md item 2). A false failure that
// mimics a real finding is worse than no soak at all.
//
// So the budget owns both halves: `canStart()` refuses to start an iteration the
// remaining budget cannot pay for, and `soakTestTimeout()` is the one place the
// vitest headroom is decided.

/** Headroom over the soak's own budget, covering what the budget cannot see:
 *  module setup, the resolver spawn, teardown, and the tail of whichever
 *  iteration was running when the deadline passed. Deliberately generous — a
 *  soak is opt-in and long-running, so a late honest failure costs far less than
 *  an early false one.
 *
 *  This bounds the SYSTEMATIC overshoot, not every possible one. `canStart()`
 *  decides when an iteration may begin; nothing can preempt one already running,
 *  because the work is synchronous JavaScript. A single pathological iteration
 *  therefore still blows through any headroom — one was measured at 340s among
 *  ~740 iterations averaging 35ms (docs/done/soak-single-iteration-pathology.md).
 *  Raising this number does not fix that; bounding the per-iteration cost does. **/
export const SOAK_HEADROOM_MS = 180_000;

/** Vitest timeout for an opt-in soak test sized from its wall-clock budget. **/
export function soakTestTimeout(soakMs: number, headroomMs: number = SOAK_HEADROOM_MS): number {
  return Math.max(0, soakMs) + headroomMs;
}

/** Per-iteration cost ceiling for the soak lanes' pathology tripwire. Above
 *  both in-lane timeouts (compile 10s, jsonschema scan 20s — those already
 *  surface as violations), so only genuinely unbounded synchronous work trips
 *  it. When one iteration exceeds this, the soak FAILS naming the round and
 *  its cost — an actionable finding with a replayable seed — instead of
 *  blowing the vitest timeout and mimicking a harness failure
 *  (docs/done/soak-single-iteration-pathology.md is the incident that
 *  motivated it: one 340s iteration among ~740 averaging 35ms). **/
export const SOAK_ITERATION_CEILING_MS = 30_000;

/** The soak tests' tripwire assertion, shared so the message stays uniform:
 *  `expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull()`.
 *  Returns null when every iteration stayed under the ceiling. **/
export function pathologyReport(
  slowestIterationMs: number | undefined,
  slowestIterationRound: number | undefined
): string | null {
  if (slowestIterationMs === undefined || slowestIterationMs <= SOAK_ITERATION_CEILING_MS) return null;
  return (
    `single-iteration pathology: round ${slowestIterationRound} took ${slowestIterationMs}ms ` +
    `(ceiling ${SOAK_ITERATION_CEILING_MS}ms). This is a FINDING — a state-dependent slow iteration, ` +
    `not a harness failure. Replay with this run's seed and the named round ` +
    `(docs/done/soak-single-iteration-pathology.md has the playbook).`
  );
}

export interface SoakBudget {
  /** True when another iteration fits in what is left of the budget. A `true`
   *  answer also starts the clock for that iteration, so any fixed setup done
   *  BEFORE the loop (opening a client, running a deterministic floor) is
   *  charged to the budget without polluting the per-iteration cost. Calling it
   *  twice in a row is harmless — the later call wins. **/
  canStart(): boolean;
  /** Record that an iteration just ended, so its cost informs `canStart()`. **/
  mark(): void;
  /** Iterations recorded via `mark()` so far. **/
  markedIterations(): number;
  /** Longest iteration observed so far, in ms (0 before the first `mark()`). **/
  slowestIterationMs(): number;
  /** Zero-based index (mark order) of the slowest iteration so far, -1 before
   *  the first `mark()` — names the round to replay when the tripwire fires. **/
  slowestIterationRound(): number;
  /** Wall clock since the budget started, in ms. **/
  elapsedMs(): number;
}

/** Start a wall-clock budget of `durationMs`. The loop shape is:
 *
 *    const budget = startSoakBudget(durationMs);
 *    while (budget.canStart()) {
 *      await oneIteration();
 *      budget.mark();
 *    }
 *
 *  `now` is injectable so the budget's own behaviour is unit-testable without
 *  burning real seconds. **/
export function startSoakBudget(durationMs: number, now: () => number = () => Date.now()): SoakBudget {
  const start = now();
  const deadline = start + durationMs;
  let iterationStartedAt = start;
  let slowestIterationMs = 0;
  let slowestIterationRound = -1;
  let markedIterations = 0;

  return {
    canStart(): boolean {
      const at = now();
      const remaining = deadline - at;
      if (remaining <= 0) return false;
      iterationStartedAt = at;
      // The first iteration always runs when there is any budget at all: its cost
      // is unknown, and a soak that ran zero iterations would report as clean
      // without having fuzzed anything. Afterwards, only start an iteration the
      // remaining budget can pay for at the SLOWEST cost seen — the slow outlier
      // (a compile that hit the resolver timeout) is exactly the one that would
      // blow past the vitest timeout, so it is the one to budget for.
      if (markedIterations === 0) return true;
      return remaining > slowestIterationMs;
    },
    mark(): void {
      const at = now();
      const cost = at - iterationStartedAt;
      if (cost > slowestIterationMs) {
        slowestIterationMs = cost;
        slowestIterationRound = markedIterations;
      }
      iterationStartedAt = at;
      markedIterations++;
    },
    markedIterations: () => markedIterations,
    slowestIterationMs: () => slowestIterationMs,
    slowestIterationRound: () => slowestIterationRound,
    elapsedMs: () => now() - start,
  };
}
