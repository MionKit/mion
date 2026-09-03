// Pins the binary decoder's bounds checks: the crafted wires the security
// spike found by hand (a five-byte count that used to exhaust the heap, a
// truncated buffer that decoded to garbage, a string claiming more bytes than
// the buffer holds) now throw BinaryDecodeError promptly, a count is refused
// BEFORE anything is allocated, zero-byte items get a fixed ceiling, and a
// valid wire still decodes after every rejected one.
//
// The secbinary fuzz lane (test/fuzz/security/) hunts this class of bug at
// random; these are its seed-free repros.

import {describe, expect, it} from 'vitest';
import {
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createDataViewDeserializer,
  BinaryDecodeError,
  MAX_ZERO_BYTE_ITEMS,
} from '@mionjs/run-types';

function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  do {
    let byte = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) byte |= 0x80;
    out.push(byte);
  } while (rest > 0);
  return out;
}

const bytes = (...parts: Array<number | number[] | Uint8Array>): Uint8Array =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'number' ? [part] : [...part])));

describe('binary decoder bounds: counts', () => {
  const encode = createBinaryEncoderFn<string[]>();
  const decode = createBinaryDecoderFn<string[]>();
  const valid = encode(['hello', 'world', 'abc']);

  it('a varint for 2^31 followed by nothing throws BinaryDecodeError at once (the heap-out-of-memory body)', () => {
    const started = performance.now();
    expect(() => decode(bytes(varint(2 ** 31)))).toThrow(BinaryDecodeError);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('a count of 2^24 with no items behind it is refused, not allocated', () => {
    expect(() => decode(bytes(varint(2 ** 24)))).toThrow(/count 16777216 .* exceeds/);
  });

  it('a count one past what the bytes left can hold is refused', () => {
    // Three one-byte strings behind a count of four: each item needs at
    // least its length byte, so four cannot fit in three bytes.
    expect(() => decode(bytes(varint(4), varint(0), varint(0), varint(0)))).toThrow(BinaryDecodeError);
    expect(decode(bytes(varint(3), varint(0), varint(0), varint(0)))).toEqual(['', '', '']);
  });

  it('a varint wider than five bytes is refused', () => {
    expect(() => decode(bytes([0xff, 0xff, 0xff, 0xff, 0xff, 0x01]))).toThrow(/wider than 5 bytes/);
    expect(() => decode(bytes(new Uint8Array(64).fill(0xff)))).toThrow(BinaryDecodeError);
  });

  it('a varint cut off by the end of the buffer is refused', () => {
    expect(() => decode(bytes([0x80]))).toThrow(/runs past/);
    expect(() => decode(new Uint8Array(0))).toThrow(/runs past/);
  });

  it('the valid wire still decodes after every refused one', () => {
    for (const bad of [bytes(varint(2 ** 31)), bytes([0x80]), bytes(varint(4), 0, 0, 0)]) {
      expect(() => decode(bad)).toThrow(BinaryDecodeError);
      expect(decode(valid)).toEqual(['hello', 'world', 'abc']);
    }
  });
});

describe('binary decoder bounds: strings', () => {
  const encode = createBinaryEncoderFn<string[]>();
  const decode = createBinaryDecoderFn<string[]>();

  it('a truncated buffer throws instead of decoding to garbage', () => {
    const valid = encode(['hello', 'world', 'abc']);
    // The spike's finding: cutting inside the last string used to decode to
    // ["hello","world","a"].
    expect(() => decode(valid.subarray(0, valid.length - 2))).toThrow(BinaryDecodeError);
    for (let end = 0; end < valid.length; end++) expect(() => decode(valid.subarray(0, end))).toThrow(BinaryDecodeError);
  });

  it('a string declaring more bytes than the buffer holds throws', () => {
    expect(() => decode(bytes(varint(1), varint(10), 0x61, 0x62))).toThrow(/string of 10 bytes .* runs past/);
  });

  it('the deserializer index never passes the end when a decode returns', () => {
    const valid = encode(['a', 'bc']);
    const des = createDataViewDeserializer('bounds', valid);
    expect(decode(des)).toEqual(['a', 'bc']);
    expect(des.index).toBe(valid.byteLength);
  });
});

describe('binary decoder bounds: arms that consume without reading', () => {
  it('a null or undefined sentinel past the end throws instead of returning the value', () => {
    // These arms advance the index without a read, so the reader cannot
    // check them; the decoder compares the index to the buffer at the end.
    expect(() => createBinaryDecoderFn<null>()(new Uint8Array(0))).toThrow(BinaryDecodeError);
    expect(() => createBinaryDecoderFn<undefined>()(new Uint8Array(0))).toThrow(BinaryDecodeError);
    expect(createBinaryDecoderFn<null>()(createBinaryEncoderFn<null>()(null))).toBeNull();
  });

  it('an optional-property bitmap past the end throws instead of returning an empty object', () => {
    interface AllOptional {
      a?: null;
      b?: null;
    }
    const decode = createBinaryDecoderFn<AllOptional>();
    const encode = createBinaryEncoderFn<AllOptional>();
    // The bitmap byte itself is read through the DataView, whose own
    // RangeError fires on an empty buffer; a bitmap that claims both null
    // sentinels with no bytes behind it reaches the end-of-decode compare.
    // Either way the decode never returns.
    expect(() => decode(new Uint8Array(0))).toThrow();
    expect(() => decode(new Uint8Array([0b11]))).toThrow(BinaryDecodeError);
    expect(decode(encode({a: null}))).toEqual({a: null});
    expect(decode(encode({}))).toEqual({});
  });
});

describe('binary decoder bounds: every counted container', () => {
  it('an index signature count is bounded by the bytes left', () => {
    const decode = createBinaryDecoderFn<Record<string, number>>();
    const encode = createBinaryEncoderFn<Record<string, number>>();
    // The uint32 entry count claims 2^24 entries; nothing follows.
    expect(() => decode(bytes([0, 0, 0, 1]))).toThrow(BinaryDecodeError);
    expect(decode(encode({a: 1}))).toEqual({a: 1});
  });

  it('a Map and a Set count are bounded by the bytes left', () => {
    const decodeMap = createBinaryDecoderFn<Map<string, number>>();
    const decodeSet = createBinaryDecoderFn<Set<number>>();
    expect(() => decodeMap(bytes(varint(2 ** 20)))).toThrow(BinaryDecodeError);
    expect(() => decodeSet(bytes(varint(2 ** 20)))).toThrow(BinaryDecodeError);
    expect(decodeSet(createBinaryEncoderFn<Set<number>>()(new Set([1, 2])))).toEqual(new Set([1, 2]));
  });

  it('a tuple rest count is bounded by the bytes left', () => {
    const decode = createBinaryDecoderFn<[number, ...string[]]>();
    const encode = createBinaryEncoderFn<[number, ...string[]]>();
    const valid = encode([1, 'a', 'b']);
    expect(() => decode(bytes(valid.subarray(0, 8), varint(2 ** 20)))).toThrow(BinaryDecodeError);
    expect(decode(valid)).toEqual([1, 'a', 'b']);
  });

  it('zero-byte items get a fixed ceiling instead of no bound at all', () => {
    // A literal writes nothing, so no byte count can bound its array.
    const decode = createBinaryDecoderFn<'a'[]>();
    expect(decode(bytes(varint(3)))).toEqual(['a', 'a', 'a']);
    expect(() => decode(bytes(varint(MAX_ZERO_BYTE_ITEMS + 1)))).toThrow(BinaryDecodeError);
  });
});

describe('binary decoder bounds: every read throws the one typed error', () => {
  it('invalid UTF-8 in a string is refused instead of replaced', () => {
    const decode = createBinaryDecoderFn<string>();
    // A lone continuation byte and a truncated two-byte sequence.
    expect(() => decode(bytes(varint(2), 0x80, 0x80))).toThrow(BinaryDecodeError);
    expect(() => decode(bytes(varint(1), 0xc3))).toThrow(/UTF-8/);
    expect(decode(createBinaryEncoderFn<string>()('héllo'))).toBe('héllo');
  });

  it('a fixed-width slot cut off by the end of the buffer throws BinaryDecodeError, not a raw RangeError', () => {
    expect(() => createBinaryDecoderFn<number>()(bytes([1, 2, 3]))).toThrow(BinaryDecodeError);
    enum Colour {
      Red,
      Blue,
    }
    expect(() => createBinaryDecoderFn<Colour>()(bytes([0, 0]))).toThrow(BinaryDecodeError);
    interface Timed {
      at: Temporal.PlainTime;
    }
    expect(() => createBinaryDecoderFn<Timed>()(bytes([1, 2]))).toThrow(BinaryDecodeError);
    interface AllOptional {
      a?: number;
    }
    expect(() => createBinaryDecoderFn<AllOptional>()(new Uint8Array(0))).toThrow(BinaryDecodeError);
    expect(createBinaryDecoderFn<number>()(createBinaryEncoderFn<number>()(1.5))).toBe(1.5);
  });
});
