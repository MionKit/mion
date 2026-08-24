// Encoder mode matrix — covers all three strategy values of the JSON encoder
// API. Pairs with the decoder mode coverage in decoderSafeMode.test.ts.
//
// Strategies validated:
//
//   strategy | family used                        |
//   clone    | pjs (prepareForJsonSafe)  (default) |
//   mutate   | pj (prepareForJson)                 |
//   direct   | sj (stringifyJson)                  |
//
// `clone` is shape-derived: it builds a NEW value from the declared type shape,
// so undeclared keys are dropped by construction (a clone is stripped for free).
// `mutate` transforms in place and preserves undeclared keys. The old
// `stripClone` / `stripMutate` strategies were removed — clone already strips,
// so a separate strip variant was redundant.

import {describe, expect, it} from 'vitest';
import {createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';

type Sample = {a: string; n: bigint};

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
    // Decoder strips undeclared keys only with the default 'strip' strategy.
    // Use 'preserve' so extras pass through.
    const decode = createJsonDecoderFn<Sample>(undefined, {strategy: 'preserve'});
    const input = {a: 'hi', n: 5n, surplus: 'x'} as Sample & {surplus: string};
    const wire = encode(input)!;
    const back = decode(wire) as Record<string, unknown>;
    expect(back.a).toBe('hi');
    expect(back.n).toBe(5n);
    expect(back.surplus).toBe('x');
  });
});
