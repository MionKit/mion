// Cross-engine equivalence for the `rt::countEnumKeys` pure fn.
//
// The factory picks its counter ONCE at materialisation, based on the host
// engine: a for-in counter on V8 (Node / Deno) and an `Object.keys` counter on
// JavaScriptCore (Bun), because the two engines invert on which is faster.
//
// That split is only safe if BOTH counters return the same number for every
// input the fast path can reach — otherwise the same program would report
// unknown keys on Bun and not on Node. for-in counts own + INHERITED enumerable
// properties, `Object.keys` counts own enumerable only, so the JSC counter
// guards on the prototype chain contributing nothing enumerable and falls back
// to for-in when it does. These tests pin that equivalence.
//
// CI has no Bun lane, so the JSC branch is forced under Node by defining a
// `Bun` global while the factory runs. Both counters are then exercised
// directly, side by side, in one process.

import {afterEach, describe, expect, it} from 'vitest';
import {pf_countEnumKeys} from '../../src/runtypes/pure-fns-utils.ts';
import {mulberry32} from '../fuzz/core/seededRng.ts';

type Counter = (obj: Record<string | number, any>) => number;

/** Materialise the counter the factory picks when `Bun` is / is not a global. **/
function materializeCounter(asBun: boolean): Counter {
  const factory = pf_countEnumKeys.createPureFn;
  if (typeof factory !== 'function') throw new Error('rt::countEnumKeys has no factory — test setup is wrong');
  const globals = globalThis as Record<string, unknown>;
  const hadBun = 'Bun' in globals;
  const previousBun = globals.Bun;
  if (asBun) globals.Bun = {};
  else delete globals.Bun;
  try {
    return factory(undefined as any) as Counter;
  } finally {
    if (hadBun) globals.Bun = previousBun;
    else delete globals.Bun;
  }
}

const countV8 = materializeCounter(false);
const countJSC = materializeCounter(true);

/** Every counter must agree, and agree with the own-enumerable-aware oracle. **/
function expectAgreement(value: Record<string | number, any>, expected: number): void {
  expect(countV8(value)).toBe(expected);
  expect(countJSC(value)).toBe(expected);
}

describe('rt::countEnumKeys — branch selection', () => {
  it('picks the Object.keys counter when Bun is present', () => {
    const originalKeys = Object.keys;
    let calls = 0;
    Object.keys = ((obj: object) => {
      calls++;
      return originalKeys(obj);
    }) as typeof Object.keys;
    try {
      countJSC({a: 1, b: 2});
    } finally {
      Object.keys = originalKeys;
    }
    expect(calls).toBe(1);
  });

  it('picks the for-in counter when Bun is absent', () => {
    const originalKeys = Object.keys;
    let calls = 0;
    Object.keys = ((obj: object) => {
      calls++;
      return originalKeys(obj);
    }) as typeof Object.keys;
    try {
      countV8({a: 1, b: 2});
    } finally {
      Object.keys = originalKeys;
    }
    expect(calls).toBe(0);
  });
});

describe('rt::countEnumKeys — both counters agree', () => {
  it('counts a plain object literal', () => {
    expectAgreement({a: 'x', b: 1}, 2);
  });

  it('counts an empty object', () => {
    expectAgreement({}, 0);
  });

  it('counts only the top level of a nested object', () => {
    expectAgreement({name: 'n', address: {street: 's', city: 'c'}}, 2);
  });

  it('counts an extra key (the dirty case the fast path must catch)', () => {
    expectAgreement({a: 'x', b: 1, extra: true}, 3);
  });

  it('counts a missing key (the fast path false-positive case)', () => {
    expectAgreement({a: 'x'}, 1);
  });

  it('counts a swapped key as the same total', () => {
    expectAgreement({a: 'x', swapped: 1}, 2);
  });

  it('counts numeric and string keys alike', () => {
    expectAgreement({0: 'a', 1: 'b', named: 'c'}, 3);
  });

  it('counts undefined-valued keys — presence, not value', () => {
    expectAgreement({a: undefined, b: 1}, 2);
  });

  it('ignores symbol keys (neither for-in nor Object.keys sees them)', () => {
    expectAgreement({a: 1, [Symbol('s')]: 2}, 1);
  });

  it('ignores non-enumerable own properties', () => {
    const value = {a: 1};
    Object.defineProperty(value, 'hidden', {value: 2, enumerable: false});
    expectAgreement(value, 1);
  });

  it('counts a null-prototype object', () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.a = 1;
    value.b = 2;
    expectAgreement(value, 2);
  });

  it('agrees on a class instance (prototype methods are non-enumerable)', () => {
    class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
      distance(): number {
        return this.x + this.y;
      }
    }
    expectAgreement(new Point(1, 2) as unknown as Record<string, unknown>, 2);
  });

  it('agrees on an object whose prototype carries an enumerable property', () => {
    // The divergent shape: for-in counts the inherited `inherited` key,
    // Object.keys does not. The JSC counter must detect the non-plain
    // prototype and fall back, so both report the for-in answer.
    const value = Object.create({inherited: 'p'}) as Record<string, unknown>;
    value.a = 1;
    expectAgreement(value, 2);
  });

  it('agrees when the prototype carries an EXTRA enumerable property', () => {
    const value = Object.create({extra: true}) as Record<string, unknown>;
    value.a = 1;
    value.b = 2;
    expectAgreement(value, 3);
  });

  it('agrees on a deep prototype chain of enumerable properties', () => {
    const grandparent = {g: 1};
    const parent = Object.create(grandparent) as Record<string, unknown>;
    parent.p = 2;
    const value = Object.create(parent) as Record<string, unknown>;
    value.own = 3;
    expectAgreement(value, 3);
  });

  it('agrees on an array (indices are enumerable own keys)', () => {
    expectAgreement(['a', 'b', 'c'] as unknown as Record<string, unknown>, 3);
  });

  // Out of contract — the fast path only ever sees validated objects — but the
  // two counters must still not DIVERGE on them, or a stray input would throw
  // on Bun and quietly return 0 on Node. `for-in` over a nullish value iterates
  // zero times, so the JSC counter has to tolerate them rather than hand them
  // to Object.getPrototypeOf.
  it('agrees on null', () => {
    expectAgreement(null as unknown as Record<string, unknown>, 0);
  });

  it('agrees on undefined', () => {
    expectAgreement(undefined as unknown as Record<string, unknown>, 0);
  });

  it('agrees on primitives (boxed prototypes are not plain)', () => {
    expectAgreement(7 as unknown as Record<string, unknown>, 0);
    expectAgreement(true as unknown as Record<string, unknown>, 0);
    expectAgreement('abc' as unknown as Record<string, unknown>, 3);
  });
});

describe('rt::countEnumKeys — seeded equivalence sweep', () => {
  // Property (compare-to-a-trusted-source): the two counters must return the
  // same number for EVERY generated object. The V8 counter is the incumbent
  // and therefore the trusted source; any disagreement is exactly the
  // cross-engine divergence this design has to rule out.
  afterEach(() => {
    // The sweep never mutates Object.prototype, but a leak here would poison
    // every other suite — assert it stayed clean.
    expect(Object.keys(Object.prototype).length).toBe(0);
  });

  function randomObject(random: () => number, depth: number): Record<string, unknown> {
    const shape = random();
    let value: Record<string, unknown>;
    if (shape < 0.15) {
      value = Object.create(null) as Record<string, unknown>;
    } else if (shape < 0.35 && depth > 0) {
      // A prototype carrying enumerable properties — the divergent shape.
      value = Object.create(randomObject(random, depth - 1)) as Record<string, unknown>;
    } else {
      value = {};
    }
    const ownCount = Math.floor(random() * 8);
    for (let i = 0; i < ownCount; i++) {
      const key = 'k' + Math.floor(random() * 12);
      const kind = random();
      if (kind < 0.1) {
        Object.defineProperty(value, key, {value: i, enumerable: false, configurable: true, writable: true});
      } else if (kind < 0.2) {
        value[key] = undefined;
      } else if (kind < 0.3 && depth > 0) {
        value[key] = randomObject(random, depth - 1);
      } else {
        value[key] = i;
      }
    }
    return value;
  }

  it('agrees on 5000 generated objects', () => {
    const baseSeed = 0x5eed;
    for (let iteration = 0; iteration < 5000; iteration++) {
      const random = mulberry32(baseSeed + iteration);
      const value = randomObject(random, 3);
      const fromV8 = countV8(value);
      const fromJSC = countJSC(value);
      if (fromV8 !== fromJSC) {
        throw new Error(
          `counters disagree at iteration ${iteration} (seed ${baseSeed + iteration}): ` + `for-in=${fromV8} keys=${fromJSC}`
        );
      }
    }
  });
});
