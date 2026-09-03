// A value can occupy ZERO bytes on the binary wire: a record whose only
// values are functions writes nothing (the encoder skips a function-valued
// index signature entirely). The decoder's count bound (an item needs at
// least its floor in bytes) once assumed the four-byte count slot for every
// index signature, so a Set or array of such records was refused as a
// malformed wire. Found by the non-data type fuzz lane.

import {describe, expect, it} from 'vitest';
import {createBinaryDecoderFn, createBinaryEncoderFn} from '@mionjs/run-types';

type FnRecord = Record<string, (n: number) => number>;

describe('binary: members that occupy zero bytes decode', () => {
  it('a Set of function-only records round-trips', () => {
    const encode = createBinaryEncoderFn<Set<FnRecord>>();
    const decode = createBinaryDecoderFn<Set<FnRecord>>();
    const decoded = decode(encode(new Set<FnRecord>([{a: (n) => n}, {}])));
    expect(decoded).toBeInstanceOf(Set);
    expect([...decoded]).toEqual([{}, {}]);
  });

  it('an array and a Map value of function-only records round-trip', () => {
    const encodeArr = createBinaryEncoderFn<FnRecord[]>();
    const decodeArr = createBinaryDecoderFn<FnRecord[]>();
    expect(decodeArr(encodeArr([{a: (n) => n}, {}, {b: (n) => n * 2}]))).toEqual([{}, {}, {}]);
    const encodeMap = createBinaryEncoderFn<Map<string, FnRecord>>();
    const decodeMap = createBinaryDecoderFn<Map<string, FnRecord>>();
    expect([...decodeMap(encodeMap(new Map([['k', {a: (n: number) => n}]])))]).toEqual([['k', {}]]);
  });

  it('a Set of empty tuples and of a literal round-trips (also zero bytes)', () => {
    const encodeLit = createBinaryEncoderFn<Set<'only'>>();
    const decodeLit = createBinaryDecoderFn<Set<'only'>>();
    expect([...decodeLit(encodeLit(new Set(['only'] as const)))]).toEqual(['only']);
    const encodeTup = createBinaryEncoderFn<[][]>();
    const decodeTup = createBinaryDecoderFn<[][]>();
    expect(decodeTup(encodeTup([[], [], []]))).toEqual([[], [], []]);
  });
});
