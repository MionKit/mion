// Regression for the bug the fuzzer surfaced: createBinaryEncoderFn owns its
// serializer and sizes it from adaptive history. After many small encodes the
// predicted size converges down toward the running mean, so an above-average
// string used to overflow the buffer and throw
// `RangeError: buffer too small to encode string … Call resize() and retry.`
// instead of growing. The serializer now GROWS IN PLACE (ensureCapacity copies
// the written prefix into a larger buffer), so an above-average payload settles
// in a single copy with no throw and no re-encode-from-scratch.

import * as TF from '@mionjs/run-types/formats';
import {describe, it, expect} from 'vitest';
import * as RT from '@mionjs/run-types/builders';
import {createBinaryEncoderFn, createBinaryDecoderFn} from '@mionjs/run-types';

describe('fuzz / regression — binary encoder grows its buffer on overflow', () => {
  it('encodes an above-average string after the size history converged down', () => {
    const schema = RT.object({s: TF.string()});
    const encode = createBinaryEncoderFn(schema);
    const decode = createBinaryDecoderFn(schema);

    // Drive the adaptive size history down with many tiny payloads.
    for (let i = 0; i < 50; i++) encode({s: ''});

    // A string far larger than the converged prediction — used to throw.
    const big = {s: 'x'.repeat(10_000)};
    expect(() => encode(big)).not.toThrow();
    expect(decode(encode(big))).toEqual(big);

    // Encoder stays correct for small payloads afterwards too.
    expect(decode(encode({s: 'hi'}))).toEqual({s: 'hi'});
  });

  it('round-trips a bimodal small/large stream (Welford variance + in-place grow)', () => {
    const schema = RT.object({s: TF.string()});
    const encode = createBinaryEncoderFn(schema);
    const decode = createBinaryDecoderFn(schema);

    // Alternating tiny and large payloads: the running variance is high, so the
    // prediction carries headroom, and any residual miss grows in place. Neither
    // size should ever throw or corrupt across many interleaved encodes.
    for (let i = 0; i < 40; i++) {
      const small = {s: 'a'.repeat(i % 7)};
      const large = {s: 'z'.repeat(2_000 + i * 137)};
      expect(decode(encode(small))).toEqual(small);
      expect(decode(encode(large))).toEqual(large);
    }
  });
});
