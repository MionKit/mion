import {describe, it, expect} from 'vitest';
import {mulberry32, withSeededRandom, mixSeed, hashString} from './seededRng.ts';

describe('fuzz / seededRng', () => {
  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('mulberry32 yields floats in [0, 1)', () => {
    const next = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('different seeds produce different streams', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('withSeededRandom makes Math.random reproducible and restores it', () => {
    const original = Math.random;
    const run = (): number[] => withSeededRandom(99, () => [Math.random(), Math.random(), Math.random()]);
    expect(run()).toEqual(run());
    expect(Math.random).toBe(original);
  });

  it('withSeededRandom restores Math.random even when the body throws', () => {
    const original = Math.random;
    expect(() =>
      withSeededRandom(1, () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(Math.random).toBe(original);
  });

  it('mixSeed is stable and label-sensitive', () => {
    expect(mixSeed(1, 'A', 0)).toBe(mixSeed(1, 'A', 0));
    expect(mixSeed(1, 'A', 0)).not.toBe(mixSeed(1, 'B', 0));
    expect(mixSeed(1, 'A', 0)).not.toBe(mixSeed(1, 'A', 1));
  });

  it('hashString is a stable uint32', () => {
    const h = hashString('hello');
    expect(h).toBe(hashString('hello'));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});
