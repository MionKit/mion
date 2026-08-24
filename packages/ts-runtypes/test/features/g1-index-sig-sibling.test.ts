// G1 regression: an object that mixes a named property with an index signature
// whose VALUE type differs must not apply the index value's transform to the
// named property. Before the fix, `{p0: number; [k: number]: bigint}` round-
// tripped `p0` (a number) into a bigint on the JSON wire (the index for-in loop
// transformed every own key). Binary was already correct (F1); the JSON mutate /
// restore / direct walks now skip declared sibling keys too.
import {describe, it, expect} from 'vitest';
import {createJsonEncoderFn, createJsonDecoderFn, createBinaryEncoderFn, createBinaryDecoderFn} from '@ts-runtypes/core';

describe('G1 — index signature does not corrupt a named sibling property', () => {
  it('{p0: number; [k: number]: bigint} keeps p0 a number across every wire', () => {
    type A = {p0: number; [k: number]: bigint};
    const make = (): A => ({p0: 1, 5: 7n, 9: 11n});

    // JSON, every encoder strategy paired with its decoder.
    const pairs = [
      ['clone', 'strip'],
      ['mutate', 'preserve'],
      ['direct', 'strip'],
    ] as const;
    for (const [enc, dec] of pairs) {
      const out = createJsonDecoderFn<A>(undefined, {strategy: dec})(createJsonEncoderFn<A>(undefined, {strategy: enc})(make())!);
      expect(typeof out.p0, `[json/${enc}] p0 must stay a number`).toBe('number');
      expect(out.p0, `[json/${enc}] p0 value`).toBe(1);
      expect(out[5], `[json/${enc}] index value 5`).toBe(7n);
      expect(out[9], `[json/${enc}] index value 9`).toBe(11n);
    }

    // Binary round-trips identically.
    const bout = createBinaryDecoderFn<A>()(createBinaryEncoderFn<A>()(make()));
    expect(typeof bout.p0).toBe('number');
    expect(bout.p0).toBe(1);
    expect(bout[5]).toBe(7n);

    // Cross-wire agreement: the JSON and binary decodes match.
    const viaJson = createJsonDecoderFn<A>()(createJsonEncoderFn<A>()(make())!);
    const viaBinary = createBinaryDecoderFn<A>()(createBinaryEncoderFn<A>()(make()));
    expect(viaBinary).toEqual(viaJson);
  });

  it('{name: string; [id: number]: Date} keeps the string prop and revives Dates', () => {
    type B = {name: string; [id: number]: Date};
    const make = (): B => ({name: 'hi', 1: new Date('2020-01-01T00:00:00.000Z')});
    const out = createJsonDecoderFn<B>()(createJsonEncoderFn<B>()(make())!);
    expect(out.name).toBe('hi');
    expect(out[1]).toBeInstanceOf(Date);
    expect((out[1] as Date).toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });
});
