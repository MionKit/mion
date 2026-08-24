// The single, encapsulated source of randomness for the mock generator. Every
// random draw the mock library makes — the atomic primitives that used to live
// as free functions in `mockUtils.ts`, plus the inline `Math.random()` /
// `crypto` / clock reads scattered across the format and edge mock files — goes
// through ONE `MockRandom` instance, threaded on the mock options bag so the
// whole walk shares a single cursor.
//
// Two modes, chosen by the constructor:
//   - `new MockRandom()`  — native: every method reads the platform source
//     (`Math.random()` / `crypto.randomUUID()` / `Date.now()`) LIVE at the call
//     site. Existing behavior, unchanged.
//   - `new MockRandom(seed)` — seeded: every method draws from a deterministic
//     PRNG, so the same seed reproduces the same value for every type.
//
// SOUNDNESS CONTRACT — native mode MUST call the platform source live inside the
// method body and NEVER capture a reference at construction. The fuzz harness
// (`test/fuzz/core/seededRng.ts`) makes mocking reproducible by swapping the
// global `Math.random`; a captured reference would silently defeat that swap and
// make every fuzz suite non-reproducible.
//
// DRAW-ORDER DEPENDENCE — seeded output is a function of the exact order of PRNG
// draws, so reordering the `random.*` calls in the walker changes the generated
// value. The repeatability tests (test/suites/mocking/mockSeed.test.ts) pin this.
//
// The `mulberry32` PRNG (exported below) is the single copy of the algorithm:
// the fuzz harness (`test/fuzz/core/seededRng.ts`) imports it from here, since
// `test/` can import from `src/` but not the reverse. `splitmix32` folds the
// seed before the class draws from it; both are standard 32-bit algorithms.

import {anyValuesList, stringCharSet, mockRegExpsList} from './constants.mock.ts';

// splitmix32 folds a raw seed into a well-distributed 32-bit state so small
// seeds (0, 1, 2, …) still produce a good initial PRNG stream.
function splitmix32(seed: number): number {
  let z = (seed + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

// mulberry32 — a tiny, fast, well-distributed 32-bit PRNG returning floats in
// [0, 1), the same contract as `Math.random`. Exported (not via `index.ts`, so
// it stays out of the public API) purely so the fuzz harness reuses this copy.
export function mulberry32(state: number): () => number {
  let current = state >>> 0;
  return function next(): number {
    current = (current + 0x6d2b79f5) | 0;
    let t = Math.imul(current ^ (current >>> 15), 1 | current);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed reference instant used on the SEEDED path wherever a mock would
// otherwise read the wall clock (`mockDate`'s default `maxDate = new Date()`,
// the uuid v7 timestamp, relative `now±P` date/time bounds). A constant keeps
// time-based mocks from drifting run to run. 2023-11-14T22:13:20Z — an
// arbitrary, stable epoch with no significance beyond being fixed.
const SEEDED_NOW_MS = 1_700_000_000_000;

/** The mock generator's random source. Native (`new MockRandom()`) or seeded
 *  (`new MockRandom(seed)`); every mock-random operation is a method so all
 *  randomness is encapsulated in one object passed through the mock context. **/
export class MockRandom {
  // Undefined in native mode; the seeded PRNG stream otherwise. Presence of a
  // stream is what switches every method between native and seeded behavior.
  private readonly next: (() => number) | undefined;

  constructor(seed?: number) {
    this.next = seed === undefined ? undefined : mulberry32(splitmix32(seed));
  }

  /** Float in [0, 1). Native reads `Math.random()` live (see the soundness
   *  contract); seeded draws from the PRNG. **/
  float(): number {
    return this.next ? this.next() : Math.random();
  }

  /** Inclusive random integer in [min, max]. **/
  int(min: number = 0, max: number = 10000): number {
    return Math.floor(this.float() * (max - min + 1)) + min;
  }

  /** Pick a random item from a non-empty array. **/
  pick<T>(list: T[]): T {
    return list[this.int(0, list.length - 1)];
  }

  boolean(): boolean {
    return this.float() < 0.5;
  }

  bigint(min: number = 0, max: number = 10000): bigint {
    return BigInt(this.int(min, max));
  }

  number(min: number = 0, max: number = 10000): number {
    if (min > max) throw new Error('min cannot be greater than max');
    return this.int(min, max);
  }

  /** Random string of `length` chars from `allowedChars` minus `disallowedChars`.
   *  `length` defaults to a random 0..30 (matching the former `mockString`). **/
  string(length?: number, allowedChars: string = stringCharSet, disallowedChars: string = ''): string {
    const len = length ?? this.int(0, 30);
    if (allowedChars.length === 0) throw new Error('Can not generate random string as allowedChars cannot be empty');
    const allowedCharSet = allowedChars
      .split('')
      .filter((char) => !disallowedChars.includes(char))
      .join('');
    if (allowedCharSet.length === 0)
      throw new Error('Can not generate random string as allowedChars and disallowedChars are mutually exclusive');
    return Array.from({length: len}, () => allowedCharSet[this.int(0, allowedCharSet.length - 1)]).join('');
  }

  symbol(name?: string, length?: number, charsSet?: string): symbol {
    const symbolName = name ?? this.string(length, charsSet);
    return Symbol(symbolName);
  }

  regExp(list: RegExp[] = mockRegExpsList): RegExp {
    return list[this.int(0, list.length - 1)];
  }

  /** Random date in `[minDate, maxDate]`. Bounds may be `Date` or numeric
   *  timestamps; an omitted `maxDate` defaults to `now()` (fixed under a seed). **/
  date(minDate: Date | number = new Date(0), maxDate?: Date | number): Date {
    const min = typeof minDate === 'number' ? minDate : minDate.getTime();
    const max = maxDate === undefined ? this.now() : typeof maxDate === 'number' ? maxDate : maxDate.getTime();
    if (min > max) throw new Error('minDate cannot be greater than maxDate');
    return new Date(this.int(min, max));
  }

  any(anyList: unknown[] = anyValuesList): unknown {
    return anyList[this.int(0, anyList.length - 1)];
  }

  /** Current time in ms. Native reads `Date.now()` live; seeded returns a fixed
   *  reference instant so time-based defaults don't drift run to run. **/
  now(): number {
    return this.next ? SEEDED_NOW_MS : Date.now();
  }

  /** A v4 UUID. Native prefers `crypto.randomUUID()` (falling back to a
   *  `float()`-built id when crypto is absent); seeded ALWAYS builds the id from
   *  PRNG output (never `crypto`) with the version `4` + variant bits set. **/
  uuidV4(): string {
    if (!this.next) {
      const globalCrypto = (globalThis as {crypto?: {randomUUID?: () => string}}).crypto;
      if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const rand = (this.float() * 16) | 0;
      const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  /** A v7 UUID. Native embeds the real `Date.now()` timestamp; seeded derives a
   *  deterministic timestamp (fixed base + PRNG offset) so v7 mocks repeat. **/
  uuidV7(): string {
    // 32 hex nibbles: 48-bit ms timestamp (12) + version '7' (1) + rand_a (3) +
    // variant nibble (1) + rand_b (15).
    const timeMs = this.next ? SEEDED_NOW_MS + this.int(0, 0xffffff) : Date.now();
    const timeHex = timeMs.toString(16).padStart(12, '0').slice(-12);
    const randHex = (count: number): string => {
      let out = '';
      for (let i = 0; i < count; i++) out += Math.floor(this.float() * 16).toString(16);
      return out;
    };
    const variant = ((Math.floor(this.float() * 16) & 0x3) | 0x8).toString(16);
    const full = timeHex + '7' + randHex(3) + variant + randHex(15);
    return `${full.slice(0, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}-${full.slice(16, 20)}-${full.slice(20, 32)}`;
  }
}

/** Shared native (seedless) instance. Native mode holds no state — every draw
 *  reads the platform source live — so a single instance is safe to share as the
 *  fallback for any mock path that runs without a seeded instance on its
 *  options (e.g. `mockRunType` called directly in a test). **/
export const nativeMockRandom = new MockRandom();
