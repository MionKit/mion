import {describe, it, expect} from 'vitest';
import {startCrashGuard, renderCrashes, CRASH_STREAK_LIMIT} from './crashGuard.ts';

describe('fuzz core / crashGuard', () => {
  it('records a crash with its seed and keeps running', async () => {
    const guard = startCrashGuard();
    await guard.run(11, async () => {
      throw new Error('resolver fell over');
    });
    await guard.run(12, async () => {});
    expect(guard.crashes).toEqual([{seed: 11, message: 'resolver fell over'}]);
  });

  it('runSync mirrors run for synchronous bodies', () => {
    const guard = startCrashGuard();
    guard.runSync(21, () => {
      throw new Error('compiled fn threw');
    });
    guard.runSync(22, () => {});
    expect(guard.crashes).toEqual([{seed: 21, message: 'compiled fn threw'}]);
  });

  it('stringifies non-Error throws', async () => {
    const guard = startCrashGuard();
    await guard.run(31, async () => {
      throw 'plain string';
    });
    expect(guard.crashes[0].message).toBe('plain string');
  });

  it('a success resets the streak, so scattered crashes keep recording', async () => {
    const guard = startCrashGuard();
    for (let i = 0; i < CRASH_STREAK_LIMIT * 3; i++) {
      await guard.run(100 + i, async () => {
        if (i % 2 === 0) throw new Error(`crash ${i}`);
      });
    }
    expect(guard.crashes.length).toBe(Math.ceil((CRASH_STREAK_LIMIT * 3) / 2));
  });

  it('rethrows after CRASH_STREAK_LIMIT consecutive crashes — a broken harness fails fast', async () => {
    const guard = startCrashGuard();
    let thrown: Error | undefined;
    for (let i = 0; i < CRASH_STREAK_LIMIT && !thrown; i++) {
      try {
        await guard.run(200 + i, async () => {
          throw new Error('binary missing');
        });
      } catch (err) {
        thrown = err as Error;
      }
    }
    expect(thrown?.message).toContain('consecutive iterations crashed');
    expect(thrown?.message).toContain('binary missing');
    expect(guard.crashes.length).toBe(CRASH_STREAK_LIMIT);
  });

  it('renderCrashes formats one line pair per record', () => {
    const text = renderCrashes([{seed: 7, message: 'boom'}]);
    expect(text).toContain('[crash] seed=7');
    expect(text).toContain('boom');
  });
});
