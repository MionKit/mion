// Pins the shared fuzz loop skeleton (core/runLoop.ts): the invariants a lane
// gets by construction rather than by copying a loop — entry-seed defaulting,
// per-step seed derivation, fixed-count vs duration control, crash guarding,
// budget marking with the slowest-round fields, and violation streaming.

import {describe, it, expect} from 'vitest';
import {runFuzzLoop, runFuzzLoopSync} from './runLoop.ts';
import {mixSeed} from './seededRng.ts';
import {CRASH_STREAK_LIMIT} from './crashGuard.ts';

/** A clock the test drives by hand, so budget behaviour costs no real time. **/
function fakeClock(): {now: () => number; advance: (ms: number) => void} {
  let at = 0;
  return {now: () => at, advance: (ms) => void (at += ms)};
}

describe('fuzz core / runLoop — the shared loop skeleton', () => {
  describe('mode control', () => {
    it('runs exactly the requested number of rounds', async () => {
      const seen: number[] = [];
      const loop = await runFuzzLoop({seed: 1, rounds: 4}, async (round) => {
        seen.push(round.round);
        await round.run('lane', round.round, async () => {});
      });
      expect(seen).toEqual([0, 1, 2, 3]);
      expect(loop.rounds).toBe(4);
      expect(loop.runs).toBe(4);
    });

    it('counts every step of a multi-step round', () => {
      const loop = runFuzzLoopSync({seed: 1, rounds: 3}, (round) => {
        for (let i = 0; i < 5; i++) round.run('lane', i, () => {});
      });
      expect(loop.rounds).toBe(3);
      expect(loop.runs).toBe(15);
    });

    it('runs zero rounds when asked for zero', () => {
      const loop = runFuzzLoopSync({seed: 1, rounds: 0}, () => {
        throw new Error('must not run');
      });
      expect(loop).toMatchObject({rounds: 0, runs: 0, crashes: []});
    });

    it('rejects a call that sets both modes, or neither', () => {
      expect(() => runFuzzLoopSync({rounds: 1, durationMs: 1}, () => {})).toThrow(/exactly one of/);
      expect(() => runFuzzLoopSync({}, () => {})).toThrow(/exactly one of/);
    });
  });

  describe('entry seed', () => {
    it('uses the seed the lane was given', () => {
      expect(runFuzzLoopSync({seed: 0xabc, defaultSeed: 0x111, rounds: 0}, () => {}).seed).toBe(0xabc);
    });

    it('falls back to the lane default, then to a fresh number', () => {
      expect(runFuzzLoopSync({defaultSeed: 0x1234abcd, rounds: 0}, () => {}).seed).toBe(0x1234abcd);
      const fresh = runFuzzLoopSync({rounds: 0}, () => {}).seed;
      expect(Number.isInteger(fresh)).toBe(true);
      expect(fresh).toBeGreaterThanOrEqual(0);
      expect(fresh).toBeLessThanOrEqual(0xffffffff);
    });

    it('normalises a negative seed to uint32, so it replays as reported', () => {
      expect(runFuzzLoopSync({seed: -1, rounds: 0}, () => {}).seed).toBe(0xffffffff);
    });
  });

  describe('per-step seeding', () => {
    it('hands each step mixSeed(entrySeed, label, index)', () => {
      const got: number[] = [];
      const loop = runFuzzLoopSync({seed: 0x7ee5, rounds: 2}, (round) => {
        round.run('alpha', round.round, (stepSeed) => void got.push(stepSeed));
        round.run('beta', round.round, (stepSeed) => void got.push(stepSeed));
      });
      expect(got).toEqual([
        mixSeed(0x7ee5, 'alpha', 0),
        mixSeed(0x7ee5, 'beta', 0),
        mixSeed(0x7ee5, 'alpha', 1),
        mixSeed(0x7ee5, 'beta', 1),
      ]);
      expect(loop.seed).toBe(0x7ee5);
    });

    it('replays the same stream from the same entry seed', () => {
      const collect = (): number[] => {
        const seeds: number[] = [];
        runFuzzLoopSync({seed: 42, rounds: 3}, (round) => round.run('lane', round.round, (s) => void seeds.push(s)));
        return seeds;
      };
      expect(collect()).toEqual(collect());
    });
  });

  describe('crash guarding', () => {
    it('records a throwing step against its own seed and keeps going', () => {
      const loop = runFuzzLoopSync({seed: 5, rounds: 4}, (round) =>
        round.run('lane', round.round, () => {
          if (round.round === 1) throw new Error('boom');
        })
      );
      expect(loop.rounds).toBe(4);
      expect(loop.crashes).toEqual([{seed: mixSeed(5, 'lane', 1), message: 'boom'}]);
    });

    it('lets the guard streak ceiling escape the loop', () => {
      expect(() =>
        runFuzzLoopSync({seed: 5, rounds: 10}, (round) =>
          round.run('lane', round.round, () => {
            throw new Error('always');
          })
        )
      ).toThrow(new RegExp(`${CRASH_STREAK_LIMIT} consecutive iterations crashed`));
    });

    it('captures an async rejection the same way', async () => {
      const loop = await runFuzzLoop({seed: 9, rounds: 2}, (round) =>
        round.run('lane', round.round, async () => {
          if (round.round === 0) throw new Error('async boom');
        })
      );
      expect(loop.crashes).toEqual([{seed: mixSeed(9, 'lane', 0), message: 'async boom'}]);
    });
  });

  describe('soak budget', () => {
    it('stops when the remaining budget cannot pay for another round', () => {
      const clock = fakeClock();
      const loop = runFuzzLoopSync({seed: 1, durationMs: 45, now: clock.now}, (round) =>
        round.run('lane', round.round, () => clock.advance(10))
      );
      expect(loop.rounds).toBe(4);
      expect(loop.runs).toBe(4);
      expect(loop.slowestIterationMs).toBe(10);
      expect(loop.slowestIterationRound).toBe(0);
    });

    it('marks once per ROUND, so a multi-step round is one sample', () => {
      const clock = fakeClock();
      const loop = runFuzzLoopSync({seed: 1, durationMs: 45, now: clock.now}, (round) => {
        round.run('a', round.round, () => clock.advance(5));
        round.run('b', round.round, () => clock.advance(5));
      });
      expect(loop.rounds).toBe(4);
      expect(loop.runs).toBe(8);
      expect(loop.slowestIterationMs).toBe(10);
    });

    it('names the slowest round for the pathology tripwire', () => {
      const clock = fakeClock();
      const loop = runFuzzLoopSync({seed: 1, durationMs: 100, now: clock.now}, (round) =>
        round.run('lane', round.round, () => clock.advance(round.round === 2 ? 20 : 5))
      );
      expect(loop.slowestIterationMs).toBe(20);
      expect(loop.slowestIterationRound).toBe(2);
    });

    it('omits the pathology fields in fixed-count mode', () => {
      const loop = runFuzzLoopSync({seed: 1, rounds: 2}, (round) => round.run('lane', round.round, () => {}));
      expect(loop.slowestIterationMs).toBeUndefined();
      expect(loop.slowestIterationRound).toBeUndefined();
    });
  });

  describe('violation streaming', () => {
    it('streams what each step appended, in order', () => {
      const violations: string[] = [];
      const streamed: string[] = [];
      runFuzzLoopSync<string>({seed: 1, rounds: 2, violations, onViolation: (v) => void streamed.push(v)}, (round) => {
        round.run('a', round.round, () => violations.push(`a${round.round}`));
        round.run('b', round.round, () => violations.push(`b${round.round}-1`, `b${round.round}-2`));
      });
      expect(streamed).toEqual(['a0', 'b0-1', 'b0-2', 'a1', 'b1-1', 'b1-2']);
      expect(streamed).toEqual(violations);
    });

    it('streams nothing when a step appends nothing', () => {
      const violations: string[] = [];
      const streamed: string[] = [];
      runFuzzLoopSync<string>({seed: 1, rounds: 3, violations, onViolation: (v) => void streamed.push(v)}, (round) =>
        round.run('lane', round.round, () => {})
      );
      expect(streamed).toEqual([]);
    });
  });

  describe('setup', () => {
    it('runs once with the resolved seed, before the first round', async () => {
      const order: string[] = [];
      let setupSeed = -1;
      await runFuzzLoop(
        {
          defaultSeed: 0xc0ffee,
          rounds: 2,
          setup: (seed) => {
            setupSeed = seed;
            order.push('setup');
          },
        },
        async (round) => {
          order.push(`round${round.round}`);
          await round.run('lane', round.round, async () => {});
        }
      );
      expect(setupSeed).toBe(0xc0ffee);
      expect(order).toEqual(['setup', 'round0', 'round1']);
    });

    it('is NOT crash guarded — a failing setup fails the run loudly', async () => {
      await expect(
        runFuzzLoop(
          {
            seed: 1,
            rounds: 2,
            setup: () => {
              throw new Error('resolver unavailable');
            },
          },
          async (round) => round.run('lane', round.round, async () => {})
        )
      ).rejects.toThrow('resolver unavailable');
    });
  });
});
