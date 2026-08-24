// Deterministic RNG for reproducible fuzzing.
//
// The mock generator draws all entropy through a `MockRandom` instance
// (mocking/mockRandom.ts) whose NATIVE (seedless) mode reads the global
// `Math.random` LIVE on every draw. To make a fuzz run reproducible we don't
// thread a generator through every call site — instead `withSeededRandom` swaps
// `Math.random` for a seeded PRNG for the duration of one closure and restores
// it afterwards; because native `MockRandom` reads `Math.random` live, the swap
// still governs every mock draw. (This is distinct from the mock library's own
// `seed` option, which builds a seeded `MockRandom` and bypasses `Math.random`.)
// A failing case logs its seed; re-running `withSeededRandom(seed, …)` replays
// it byte-for-byte.
//
// `mulberry32` is reused from `src/mocking/mockRandom.ts` — one copy of the
// algorithm (`test/` may import from `src/`, not the reverse). It's called with
// the RAW seed here, not the class's splitmix-mixed seed, so existing fuzz seeds
// replay identically. Re-exported so importers keep getting it from this module.

import {mulberry32} from '../../../src/mocking/mockRandom.ts';

export {mulberry32};

/** Run `fn` with `Math.random` replaced by a seeded PRNG, then restore the
 *  original. Reproducible: same seed ⇒ same draws ⇒ same generated data. **/
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/** Fold a string into a 32-bit hash (FNV-1a). Used to derive a stable
 *  per-target seed offset so two targets never share a draw sequence. **/
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mix a base seed, a target label, and an iteration index into one uint32
 *  seed. Deterministic and collision-resistant enough for replay. **/
export function mixSeed(baseSeed: number, label: string, iteration: number): number {
  let mixed = (baseSeed >>> 0) ^ hashString(label);
  mixed = Math.imul(mixed ^ iteration, 0x9e3779b1);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}
