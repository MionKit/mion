// A user class with no data members writes ZERO bytes on the binary wire when
// it is not registered, and both halves of the binary lane used to assume it
// wrote at least one.
//
// The decoder bounds a collection's count before it allocates: `count ×
// minWireBytes` must fit the bytes left, with a fixed ceiling instead when an
// item is zero-byte. The class arm reported a flat 1, so an array of a
// memberless class refused its own valid wire. The size estimator had the
// mirror of it, estimating every plain class as a registered serializer's
// string blob, which under-allocates the buffer for the structural road an
// unregistered class actually takes.
//
// Both surfaced the day the fuzz type generator started emitting classes.

import {describe, expect, it} from 'vitest';
import {createBinaryDecoderFn, createBinaryEncoderFn} from '@mionjs/run-types';

declare class NoMembers {}
declare class OptionalOnly {
  p0?: string;
}
declare class Fields {
  p0: string;
  p1: number;
}

describe('binary — a class with no data members', () => {
  it('an array of one round-trips', () => {
    const wire = createBinaryEncoderFn<NoMembers[]>()([{} as NoMembers, {} as NoMembers]);
    expect(createBinaryDecoderFn<NoMembers[]>()(wire)).toEqual([{}, {}]);
  });

  it('a Set of one round-trips', () => {
    const wire = createBinaryEncoderFn<Set<NoMembers>>()(new Set([{} as NoMembers]));
    expect(createBinaryDecoderFn<Set<NoMembers>>()(wire)).toEqual(new Set([{}]));
  });

  // The optional-presence bitmap is a real byte, so this class is NOT
  // zero-byte and keeps the tighter bound.
  it('a class with only an optional member still round-trips', () => {
    const wire = createBinaryEncoderFn<OptionalOnly[]>()([{} as OptionalOnly, {p0: 'x'} as OptionalOnly]);
    expect(createBinaryDecoderFn<OptionalOnly[]>()(wire)).toEqual([{}, {p0: 'x'}]);
  });

  it('a class carrying fields is unaffected', () => {
    const value: Fields[] = [{p0: 'a', p1: 1} as Fields, {p0: 'b', p1: 2} as Fields];
    const wire = createBinaryEncoderFn<Fields[]>()(value);
    expect(createBinaryDecoderFn<Fields[]>()(wire)).toEqual(value);
  });

  // The size-estimator half: a cold encode of an unregistered class must not
  // outgrow the buffer the compile-time estimate seeded.
  it('a cold encode of an unregistered class does not grow the buffer', () => {
    const value: Fields = {p0: 'a rather longer string than a blob guess', p1: 42} as Fields;
    const wire = createBinaryEncoderFn<Fields>()(value);
    expect(createBinaryDecoderFn<Fields>()(wire)).toEqual(value);
  });
});
