// Every JSON strategy on one value with an undeclared key: clone (pjs / rjs) drops it, mutate (pj / rj) keeps it,
// compact (cj / cjr) writes no key names. The strategy is read at build time, so it must be a literal at the call
// site; a variable falls back to the default. Union payloads live in decoderSafeMode.test.ts.

import {describe, expect, it} from 'vitest';
import {createJsonEncoderFn, createJsonDecoderFn, type InjectTypeFnArgs} from '@mionjs/run-types';
import {getRTFunction} from '@mionjs/run-types/runtime';

type Sample = {a: string; n: bigint};

// Recovered through a marker, the way a framework wrapper reaches it.
function cloneRestore<T>(id?: InjectTypeFnArgs<T, 'restoreFromJsonClone'>) {
  return getRTFunction<'restoreFromJsonClone'>(id);
}

describe('encoder modes — clone strategy', () => {
  it('clone (default): no mutation, extras stripped from output', () => {
    const encode = createJsonEncoderFn<Sample>();
    const input = {a: 'hi', n: 5n, evil: 'gone'} as Sample & {evil: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5'});
    // input untouched
    expect((input as Record<string, unknown>).evil).toBe('gone');
    expect(input.n).toBe(5n);
  });

  it('clone (explicit): same shape-derived strip as the default', () => {
    const encode = createJsonEncoderFn<Sample>(undefined, {strategy: 'clone'});
    const input = {a: 'hi', n: 5n, evil: 'gone'} as Sample & {evil: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5'});
    // input untouched
    expect((input as Record<string, unknown>).evil).toBe('gone');
    expect(input.n).toBe(5n);
  });
});

describe('encoder modes — mutate strategy', () => {
  it('mutate: mutates input, extras preserved in output', () => {
    const encode = createJsonEncoderFn<Sample>(undefined, {strategy: 'mutate'});
    const input = {a: 'hi', n: 5n, extra: 'survives'} as Sample & {extra: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5', extra: 'survives'});
    // input WAS mutated — bigint transformed in place
    expect(typeof input.n).toBe('string');
  });
});

describe('encoder modes — round-trip with matching decoder', () => {
  // Every encoder shape should produce wire output that round-trips
  // through the safe decoder.
  it('clone round-trips correctly', () => {
    const encode = createJsonEncoderFn<Sample>(undefined, {strategy: 'clone'});
    const decode = createJsonDecoderFn<Sample>();
    const wire = encode({a: 'hi', n: 5n})!;
    const back = decode(wire);
    expect(back).toEqual({a: 'hi', n: 5n});
  });

  it('mutate+mutate round-trips with extras surviving the decode', () => {
    const encode = createJsonEncoderFn<Sample>(undefined, {strategy: 'mutate'});
    const decode = createJsonDecoderFn<Sample>(undefined, {strategy: 'mutate'});
    const input = {a: 'hi', n: 5n, surplus: 'x'} as Sample & {surplus: string};
    const wire = encode(input)!;
    const back = decode(wire) as Record<string, unknown>;
    expect(back.a).toBe('hi');
    expect(back.n).toBe(5n);
    expect(back.surplus).toBe('x');
  });
});

describe('encoder modes — compact strategy', () => {
  it('compact: no mutation, and the wire carries no key names', () => {
    const encode = createJsonEncoderFn<Sample>(undefined, {strategy: 'compact'});
    const input = {a: 'hi', n: 5n, evil: 'gone'} as Sample & {evil: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual(['hi', '5']);
    expect((input as Record<string, unknown>).evil).toBe('gone');
    expect(input.n).toBe(5n);
  });

  it('compact round-trips through its own decoder', () => {
    const encode = createJsonEncoderFn<Sample>(undefined, {strategy: 'compact'});
    const decode = createJsonDecoderFn<Sample>(undefined, {strategy: 'compact'});
    expect(decode(encode({a: 'hi', n: 5n})!)).toEqual({a: 'hi', n: 5n});
  });
});

describe('decoder modes — what an undeclared wire key becomes', () => {
  const wire = '{"a":"hi","n":"5","evil":1}';

  it('clone (default) drops it: the key is absent', () => {
    const back = createJsonDecoderFn<Sample>()(wire) as Record<string, unknown>;
    expect('evil' in back).toBe(false);
    expect(back.n).toBe(5n);
  });

  it('clone (explicit) drops it the same way', () => {
    const back = createJsonDecoderFn<Sample>(undefined, {strategy: 'clone'})(wire) as Record<string, unknown>;
    expect('evil' in back).toBe(false);
    expect(back.n).toBe(5n);
  });

  it('mutate keeps it with its value', () => {
    const back = createJsonDecoderFn<Sample>(undefined, {strategy: 'mutate'})(wire) as Record<string, unknown>;
    expect(back.evil).toBe(1);
    expect(back.n).toBe(5n);
  });

  it('the bare clone restore drops it too', () => {
    const back = cloneRestore<Sample>()(JSON.parse(wire)) as Record<string, unknown>;
    expect(Object.hasOwn(back, 'evil')).toBe(false);
    expect(back.n).toBe(5n);
  });
});
