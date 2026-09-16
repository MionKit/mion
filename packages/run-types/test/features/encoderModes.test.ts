// The strategy matrix: every JSON encoder and decoder strategy on one value, and what each does
// with a key the type does not declare. Pairs with decoderSafeMode.test.ts, which covers the wire
// pre-pass in depth.
//
//   encode    family                     undeclared key
//   clone     pjs (prepareForJsonSafe)   dropped (the clone is built from the declared shape)
//   mutate    pj  (prepareForJson)       kept (transforms in place, so it writes no new object)
//   direct    sj  (stringifyJson)        dropped (writes the declared members straight out)
//   compact   cj  (compactForJson)       no key names on the wire at all
//
//   decode    family                     undeclared wire key
//   strip     ukuw + rj                  BLANKED: still an own key, set to undefined
//   preserve  rj                         kept, with its value
//   compact   cjr (compactFromJson)      deleted (rebuilt from positions)
//   rjs       restoreFromJsonSafe        deleted (rebuilt from the declared shape)
//
// The strategy is read at build time, so it has to be a literal at the call site; a variable
// resolves to no strategy and the call falls back to the default.

import {describe, expect, it} from 'vitest';
import {createJsonEncoderFn, createJsonDecoderFn, getRTFunction, type InjectTypeFnArgs} from '@mionjs/run-types';

type Sample = {a: string; n: bigint};

// `rjs` is what mion's `clone` route decodes with. It has no createX factory, so it is recovered
// through a marker, the shape a framework wrapper uses.
function cloneDecoder<T>(id?: InjectTypeFnArgs<T, 'rjs'>) {
  return getRTFunction<'rjs'>(id);
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

describe('encoder modes — direct strategy', () => {
  it('direct: no mutation, always strips extras', () => {
    const encode = createJsonEncoderFn<Sample>(undefined, {strategy: 'direct'});
    const input = {a: 'hi', n: 5n, evil: 'gone'} as Sample & {evil: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5'});
    // input untouched — single-pass stringify walks the type, not v
    expect((input as Record<string, unknown>).evil).toBe('gone');
    expect(input.n).toBe(5n);
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

  it('mutate+preserve round-trips with extras surviving the decode', () => {
    const encode = createJsonEncoderFn<Sample>(undefined, {strategy: 'mutate'});
    // The default 'strip' decoder blanks an undeclared key rather than deleting it; 'preserve'
    // keeps it with its value.
    const decode = createJsonDecoderFn<Sample>(undefined, {strategy: 'preserve'});
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

  it('strip blanks it: the key stays, its value is undefined', () => {
    const back = createJsonDecoderFn<Sample>(undefined, {strategy: 'strip'})(wire) as Record<string, unknown>;
    expect(Object.hasOwn(back, 'evil')).toBe(true);
    expect(back.evil).toBeUndefined();
    expect(back.n).toBe(5n);
  });

  it('preserve keeps it with its value', () => {
    const back = createJsonDecoderFn<Sample>(undefined, {strategy: 'preserve'})(wire) as Record<string, unknown>;
    expect(back.evil).toBe(1);
    expect(back.n).toBe(5n);
  });

  it('the clone decoder deletes it', () => {
    const back = cloneDecoder<Sample>()(JSON.parse(wire)) as Record<string, unknown>;
    expect(Object.hasOwn(back, 'evil')).toBe(false);
    expect(back.n).toBe(5n);
  });
});
