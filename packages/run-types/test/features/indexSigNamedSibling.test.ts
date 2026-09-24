// A key declared by name carries its own transform, so no walk may apply the index signature's to it.
// G1 is the shared repro id for this shape, also used by the fuzz repro list and the Go codegen tests.
import {describe, it, expect} from 'vitest';
import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

describe('G1 index signature does not corrupt a named sibling property', () => {
  it('{p0: number; [k: number]: bigint} keeps p0 a number across every wire', () => {
    type A = {p0: number; [k: number]: bigint};
    const make = (): A => ({p0: 1, 5: 7n, 9: 11n});

    // JSON, every encoder strategy paired with its decoder.
    // The strategy is read at build time, so each one is spelled at its own call site; a variable
    // resolves to no strategy and the call falls back to the default.
    const pairs = [
      ['clone', createJsonEncoderFn<A>(undefined, {strategy: 'clone'}), createJsonDecoderFn<A>(undefined, {strategy: 'clone'})],
      [
        'mutate',
        createJsonEncoderFn<A>(undefined, {strategy: 'mutate'}),
        createJsonDecoderFn<A>(undefined, {strategy: 'mutate'}),
      ],
    ] as const;
    for (const [enc, encode, decode] of pairs) {
      const out = decode(encode(make())!) as A;
      expect(typeof out.p0, `[json/${enc}] p0 must stay a number`).toBe('number');
      expect(out.p0, `[json/${enc}] p0 value`).toBe(1);
      expect(out[5], `[json/${enc}] index value 5`).toBe(7n);
      expect(out[9], `[json/${enc}] index value 9`).toBe(11n);
    }

    const viaJson = createJsonDecoderFn<A>()(createJsonEncoderFn<A>()(make())!);
    expect(viaJson).toEqual(make());
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
