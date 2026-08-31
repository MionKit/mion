// Proof that 'dynamic' mode grows in place via the emitted Ser.ensureCapacity?.(n)
// reserves alone — no backstop retry loop. We force a 1-byte cold-start buffer
// (defaultBufferSize) and a fresh size history, so EVERY encode under-allocates and
// must grow through the reserves. Each case targets a distinct inline-write reserve
// site (scalar arms, fixed-width array container reserve, optional bitmap, union
// tags, index-signature count + numeric key, date). If any reserve is missing the
// raw write overflows (a DataView throw, or a silent Uint8Array write that leaves
// index past the buffer) and the round-trip fails.

import * as TF from '@mionjs/run-types/formats';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as RT from '@mionjs/run-types/builders';
import {createBinaryEncoderFn, createBinaryDecoderFn} from '@mionjs/run-types';
import {setSerializationOptions} from '../../../src/runtypes/dataView.ts';

beforeAll(() => setSerializationOptions({defaultBufferSize: 1, sizeHistory: new Map()}));
afterAll(() => setSerializationOptions({defaultBufferSize: 2 ** 14, sizeHistory: new Map()}));

describe('dynamic sizing grows in place from a 1-byte buffer (no backstop)', () => {
  it('number scalar + fixed-width number array (container reserve)', () => {
    const obj = RT.object({n: TF.number(), flag: RT.boolean()});
    const e1 = createBinaryEncoderFn(obj);
    expect(createBinaryDecoderFn(obj)(e1({n: 3.14159, flag: true}))).toEqual({n: 3.14159, flag: true});

    const arr = RT.array(TF.number());
    const big = Array.from({length: 500}, (_, i) => i * 1.5);
    expect(createBinaryDecoderFn(arr)(createBinaryEncoderFn(arr)(big))).toEqual(big);
  });

  it('long string array (serString in-place grow)', () => {
    const s = RT.array(TF.string());
    const v = Array.from({length: 50}, (_, i) => 'x'.repeat(200 + i));
    expect(createBinaryDecoderFn(s)(createBinaryEncoderFn(s)(v))).toEqual(v);
  });

  it('multi-optional object (optional bitmap zero-loop reserve)', () => {
    const s = RT.object({
      a: RT.optional(TF.string()),
      b: RT.optional(TF.number()),
      c: RT.optional(RT.boolean()),
      d: RT.optional(TF.string()),
      e: RT.optional(TF.number()),
      f: RT.optional(TF.string()),
      g: RT.optional(TF.string()),
      h: RT.optional(TF.string()),
      i: RT.optional(TF.string()), // > 8 optionals → multi-byte bitmap zero-loop
    });
    const dec = createBinaryDecoderFn(s);
    const enc = createBinaryEncoderFn(s);
    expect(dec(enc({a: 'hi', e: 42, i: 'end'}))).toEqual({a: 'hi', e: 42, i: 'end'});
    expect(dec(enc({}))).toEqual({});
  });

  it('discriminated union (tag reserve)', () => {
    const s = RT.union([RT.object({k: RT.literal('a'), x: TF.number()}), RT.object({k: RT.literal('b'), y: TF.string()})]);
    const dec = createBinaryDecoderFn(s);
    const enc = createBinaryEncoderFn(s);
    expect(dec(enc({k: 'a', x: 7}))).toEqual({k: 'a', x: 7});
    expect(dec(enc({k: 'b', y: 'hello'}))).toEqual({k: 'b', y: 'hello'});
  });

  it('record / index signature (count slot + key reserve)', () => {
    const s = createBinaryEncoderFn<{[k: string]: number}>(undefined, {cacheKey: 'grow-record'});
    const v = {alpha: 1, beta: 2, gamma: 3, delta: 4};
    expect(createBinaryDecoderFn<{[k: string]: number}>()(s(v))).toEqual(v);
  });

  it('Date array (8-byte inline reserve)', () => {
    const s = createBinaryEncoderFn<Date[]>(undefined, {cacheKey: 'grow-dates'});
    const v = [new Date('2020-01-01T00:00:00Z'), new Date('2021-06-15T12:30:00Z')];
    const out = createBinaryDecoderFn<Date[]>()(s(v)) as Date[];
    expect(out.map((d) => d.getTime())).toEqual(v.map((d) => d.getTime()));
  });

  it('deeply nested mixed payload', () => {
    const s = RT.object({
      id: TF.string(),
      scores: RT.array(TF.number()),
      profile: RT.object({name: TF.string(), age: TF.number(), active: RT.boolean(), bio: RT.optional(TF.string())}),
      tags: RT.array(TF.string()),
    });
    const v = {
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      scores: Array.from({length: 64}, (_, i) => i * 2.5),
      profile: {name: 'Ada Lovelace', age: 36, active: true, bio: 'mathematician'},
      tags: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'],
    };
    expect(createBinaryDecoderFn(s)(createBinaryEncoderFn(s)(v))).toEqual(v);
  });
});
