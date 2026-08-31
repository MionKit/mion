// The GENERIC crash-capture mechanism for fuzz loops. Every lane wraps its
// per-iteration body in a guard so a HARD failure — a resolver error, a
// harness throw, anything the lane's own oracles never get to see because no
// result exists to check — becomes a replayable record carrying the
// iteration's seed instead of killing the whole run: the remaining budget
// keeps hunting, and the report fails loudly at the end with every crash
// listed. (Born as the elision lane's E4 catch after a 20-minute soak died
// mid-run on a resolver panic with no seed recorded; generalized here so no
// lane can lose a run that way.)
//
// A crash STREAK still fails fast: consecutive crashes across DIFFERENT seeds
// mean the harness itself broke (a dead client, a missing binary, a bad
// import), and grinding on would turn one loud failure into thousands of
// identical "findings". Real input-triggered crashes are rare and scattered —
// the wild one was 1 in 3361 schemas.

/** One captured hard failure: the iteration's replay seed + the error. **/
export interface CrashRecord {
  seed: number;
  message: string;
}

/** Consecutive-crash ceiling — at this many back-to-back crashes the guard
 *  stops recording and rethrows, because different seeds failing identically
 *  is an infrastructure failure, not a generated shape. **/
export const CRASH_STREAK_LIMIT = 3;

export interface CrashGuard {
  /** The captured crashes, in iteration order. A non-empty list must FAIL the
   *  consuming test — the guard defers the failure, it never absorbs it. **/
  crashes: CrashRecord[];
  /** Run one iteration body; a throw is recorded against `seed`, not
   *  propagated (until the streak ceiling). **/
  run(seed: number, body: () => Promise<void>): Promise<void>;
  /** `run` for the synchronous lanes (compiled-fn value/clone loops). **/
  runSync(seed: number, body: () => void): void;
}

export function startCrashGuard(): CrashGuard {
  const crashes: CrashRecord[] = [];
  let streak = 0;
  const record = (seed: number, err: unknown): void => {
    const message = err instanceof Error ? err.message : String(err);
    crashes.push({seed, message});
    streak++;
    if (streak >= CRASH_STREAK_LIMIT) {
      throw new Error(
        `${CRASH_STREAK_LIMIT} consecutive iterations crashed — the harness itself is broken, not a generated shape. Last: ${message}`
      );
    }
  };
  return {
    crashes,
    async run(seed, body) {
      try {
        await body();
        streak = 0;
      } catch (err) {
        record(seed, err);
      }
    },
    runSync(seed, body) {
      try {
        body();
        streak = 0;
      } catch (err) {
        record(seed, err);
      }
    },
  };
}

/** Render crash records for a failing report — same shape the violation
 *  renderers use, so mixed failures read as one list. **/
export function renderCrashes(crashes: CrashRecord[]): string {
  return crashes.map((crash) => `  [crash] seed=${crash.seed}:\n      ${crash.message}`).join('\n');
}
