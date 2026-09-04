// A JSON Schema `patternProperties` value is data every codec carries: before
// this, validate enforced that a `^d_` key holds a Date while the JSON and
// binary encoders and decoders, the clone and the compact road ignored the
// slot, so a Date under a pattern key came back as its ISO string. Now the
// pattern-keyed values are transformed exactly like index-signature values,
// keys that do not match the pattern are left alone, and the decoders refuse a
// prototype-named key on that sweep too.

import {describe, expect, it} from 'vitest';
import type {FormattedObject} from '@mionjs/run-types/formats';
import {
  createBinaryDecoderFn,
  createBinaryEncoderFn,
  createCloneExactShapeFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createValidateFn,
} from '@mionjs/run-types';

type Stamped = FormattedObject<{name: string; [key: string]: unknown}, {patternProperties: {'^d_': Date}}>;

const sample = (): Stamped => ({name: 'log', d_created: new Date('2024-01-02T03:04:05.000Z'), note: 'plain'});

describe('patternProperties values round-trip through every codec', () => {
  const strategies = ['clone', 'mutate', 'direct', 'compact'] as const;
  for (const strategy of strategies) {
    it(`JSON ${strategy}: the ^d_ Date is restored, the other keys are untouched`, () => {
      const encode = createJsonEncoderFn<Stamped>(undefined, {strategy});
      const decode = createJsonDecoderFn<Stamped>(undefined, {strategy});
      const decoded = decode(encode(sample()) as string) as Stamped;
      expect(decoded.d_created).toBeInstanceOf(Date);
      expect((decoded.d_created as Date).toISOString()).toBe('2024-01-02T03:04:05.000Z');
      expect(decoded.name).toBe('log');
      expect(decoded.note).toBe('plain');
      expect(createValidateFn<Stamped>()(decoded)).toBe(true);
    });
  }

  it('binary: the ^d_ Date is written and read back as a Date', () => {
    const encode = createBinaryEncoderFn<Stamped>();
    const decode = createBinaryDecoderFn<Stamped>();
    const decoded = decode(encode(sample())) as Stamped;
    expect(decoded.d_created).toBeInstanceOf(Date);
    expect((decoded.d_created as Date).toISOString()).toBe('2024-01-02T03:04:05.000Z');
    expect(decoded.name).toBe('log');
  });

  it('cloneExactShape: the ^d_ Date is a fresh Date, not the same reference', () => {
    const clone = createCloneExactShapeFn<Stamped>();
    const value = sample();
    const copy = clone(value) as Stamped;
    expect(copy.d_created).toBeInstanceOf(Date);
    expect(copy.d_created).not.toBe(value.d_created);
    expect((copy.d_created as Date).getTime()).toBe((value.d_created as Date).getTime());
  });

  it('the pattern decode sweep refuses a prototype-named key', () => {
    const decode = createJsonDecoderFn<Stamped>();
    expect(() => decode('{"name":"x","__proto__":{"admin":true}}')).toThrow('[mion] Unsafe property name: __proto__');
  });
});
