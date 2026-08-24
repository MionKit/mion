// Regression: binary codec desync on unions with a function-member arm
// (docs/done/binary-union-function-member-arm-desync.md, nondata fuzz O6/O7).
// A method-like member (`f0: () => number`) is a DataOnly-dropped slot, but
// buildMergedProps only recorded stripped PROPERTY children, so the surviving
// same-name candidate from a sibling arm (`f0?: string`) compiled an
// unguarded serString — encoding `{kind: 't2', f0: fn}` fed the function to
// the string codec. The layout now marks the stripped candidate for
// method-kind members too, so the encoder guards the surviving codec and
// drops the key, mirroring DataOnly (`{kind: 't2'}` on the wire).
import {describe, expect, it} from 'vitest';
import {
  createBinaryDecoderFn,
  createBinaryEncoderFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  getRunTypeId,
} from '@ts-runtypes/core';

type Reduced = {kind: 't0'; f1: string} | {kind: 't1'; f0?: string} | {kind: 't2'; f0: () => number};

type SabArm = {kind: 'a0'; data: number[]} | {kind: 'a1'; f0?: string; size: number} | {kind: 'a2'; f0: () => SharedArrayBuffer};

describe('binary union with a function-member arm', () => {
  it('round-trips the function-member arm as its DataOnly projection', () => {
    const enc = createBinaryEncoderFn<Reduced>();
    const dec = createBinaryDecoderFn<Reduced>();
    const back = dec(enc({kind: 't2', f0: () => 1}));
    expect(back).toEqual({kind: 't2'});
  });

  it('keeps the sibling arms byte-symmetric', () => {
    const enc = createBinaryEncoderFn<Reduced>();
    const dec = createBinaryDecoderFn<Reduced>();
    expect(dec(enc({kind: 't0', f1: 'x'}))).toEqual({kind: 't0', f1: 'x'});
    expect(dec(enc({kind: 't1'}))).toEqual({kind: 't1'});
    expect(dec(enc({kind: 't1', f0: 'y'}))).toEqual({kind: 't1', f0: 'y'});
  });

  it('handles the soak shape (function returning SharedArrayBuffer) on every arm', () => {
    const enc = createBinaryEncoderFn<SabArm>();
    const dec = createBinaryDecoderFn<SabArm>();
    const fn = () => new SharedArrayBuffer(8);
    expect(dec(enc({kind: 'a2', f0: fn}))).toEqual({kind: 'a2'});
    expect(dec(enc({kind: 'a0', data: [1, 2]}))).toEqual({kind: 'a0', data: [1, 2]});
    expect(dec(enc({kind: 'a1', size: 3, f0: 's'}))).toEqual({kind: 'a1', size: 3, f0: 's'});
    expect(dec(enc({kind: 'a1', size: 3}))).toEqual({kind: 'a1', size: 3});
  });

  it('json twin drops the member symmetrically', () => {
    const enc = createJsonEncoderFn<Reduced>();
    const dec = createJsonDecoderFn<Reduced>();
    const back = dec(enc({kind: 't2', f0: () => 1})!);
    expect(back).toEqual({kind: 't2'});
  });

  it('resolves the same cache entry from the static shape', () => {
    expect(getRunTypeId<Reduced>()).toMatch(/\w+/);
  });

  it('resolves the same cache entry from the reflected value shape', () => {
    const value: Reduced = {kind: 't1', f0: 'x'};
    expect(getRunTypeId(value)).toBe(getRunTypeId<Reduced>());
  });
});
