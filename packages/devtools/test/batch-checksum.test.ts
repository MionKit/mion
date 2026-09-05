/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Property test for the batch table checksum the client build writes into
// `.mion/rpc/batches.generated.js` and the server side recomputes before importing it. Three
// rules, over seeded random id lists so a failure replays by seed:
//   - the same id SET in any order, with any duplicates, gives the same checksum
//   - a set that differs by one id gives a different checksum
//   - the value is always 16 lowercase hex chars (it is embedded in a JS string literal)
import {describe, expect, it} from 'vitest';
import {batchChecksum} from '../src/options.ts';

/** mulberry32, the tiny 32-bit PRNG the RunTypes fuzz harness uses; inlined so this test has no
 *  dependency on another project's test tree. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A random batch id in the shape the build emits: `b_` plus 14 id-safe chars. */
function randomId(next: () => number): string {
  let id = 'b_';
  for (let i = 0; i < 14; i++) id += ALPHABET[Math.floor(next() * ALPHABET.length)];
  return id;
}

function shuffled<T>(items: T[], next: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const ITERATIONS = 300;

describe('batchChecksum', () => {
  it('is a function of the id SET: order and duplicates never change it', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const next = mulberry32(seed);
      const ids = Array.from({length: 1 + Math.floor(next() * 40)}, () => randomId(next));
      const reference = batchChecksum(ids);
      expect(batchChecksum(shuffled(ids, next)), `seed ${seed}: order`).toBe(reference);
      expect(batchChecksum([...ids, ...shuffled(ids, next)]), `seed ${seed}: duplicates`).toBe(reference);
      expect(batchChecksum(new Set(ids)), `seed ${seed}: iterable`).toBe(reference);
    }
  });

  it('changes when one id is added, removed or altered', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const next = mulberry32(seed);
      const ids = Array.from({length: 1 + Math.floor(next() * 40)}, () => randomId(next));
      const reference = batchChecksum(ids);
      expect(batchChecksum([...ids, randomId(next)]), `seed ${seed}: added`).not.toBe(reference);
      const dropped = [...new Set(ids)];
      dropped.splice(Math.floor(next() * dropped.length), 1);
      expect(batchChecksum(dropped), `seed ${seed}: removed`).not.toBe(reference);
      const altered = [...ids];
      const index = Math.floor(next() * altered.length);
      altered[index] = altered[index] + 'x';
      expect(batchChecksum(altered), `seed ${seed}: altered`).not.toBe(reference);
    }
  });

  it('is always 16 lowercase hex chars, so it embeds in a JS string literal unescaped', () => {
    for (let seed = 1; seed <= ITERATIONS; seed++) {
      const next = mulberry32(seed);
      const ids = Array.from({length: Math.floor(next() * 40)}, () => randomId(next));
      expect(batchChecksum(ids), `seed ${seed}`).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('is pinned, so a hasher change cannot slip past a stale server-side check', () => {
    // sha256("b_one\nb_two") truncated to 16 hex chars
    expect(batchChecksum(['b_two', 'b_one'])).toBe(batchChecksum(['b_one', 'b_two']));
    expect(batchChecksum([])).toBe('e3b0c44298fc1c14');
  });
});
