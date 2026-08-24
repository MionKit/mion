// Regression: a union whose members all round-trip raw (every member is
// JSON-compatible) must NOT serialize through the `[armIndex, value]` /
// `[-1, mergedObject]` discriminated-union envelope. This covers the
// record-union case the user flagged
// (`Record<string, number> | {type: string; isTypeError: true}`) plus the
// broader "no member needs special encoding" rule for pure-object and
// mixed atomic/object unions. When ANY member DOES need a transform (e.g.
// a `Record<string, Date>` member) the envelope is correctly retained.
//
// Binary is unaffected: it always keeps the compact per-member discriminant
// (JSON-only collapse), so binary round-trips are asserted separately.
import {describe, expect, it} from 'vitest';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';

// A TOP-LEVEL union that round-trips raw serialises as the bare value, so its
// wire never starts with the `[-1,` / `[<digit>,` envelope array. A nested
// property envelope shows up as `:[<digit>`.
const TOP_ENVELOPE = /^\[-?\d/;
const PROP_ENVELOPE = /:\[\d/;

type RecordUnion = Record<string, number> | {type: string; isTypeError: true};

describe('serialization / record-union JSON encoding (regression)', () => {
  it('Record<string, number> | {type, isTypeError} → bare object, never enveloped', () => {
    const clone = createJsonEncoderFn<RecordUnion>();
    const direct = createJsonEncoderFn<RecordUnion>(undefined, {strategy: 'direct'});
    const mutate = createJsonEncoderFn<RecordUnion>(undefined, {strategy: 'mutate'});
    const compact = createJsonEncoderFn<RecordUnion>(undefined, {strategy: 'compact'});

    for (const enc of [clone, direct, mutate, compact]) {
      // Object arm — declared-shape order (type, isTypeError).
      expect(enc({type: 'oops', isTypeError: true})).toBe('{"type":"oops","isTypeError":true}');
      // Record arm — bare object, no wrapper.
      expect(enc({a: 1, b: 2})).toBe('{"a":1,"b":2}');
      for (const value of [{type: 'oops', isTypeError: true} as RecordUnion, {a: 1, b: 2} as RecordUnion]) {
        const wire = enc(value)!;
        expect(wire).not.toMatch(TOP_ENVELOPE);
        expect(wire).not.toMatch(PROP_ENVELOPE);
      }
    }
  });

  it('record-union round-trips through the decoder with an identity decode', () => {
    const enc = createJsonEncoderFn<RecordUnion>();
    const dec = createJsonDecoderFn<RecordUnion>();
    expect(dec(enc({type: 'oops', isTypeError: true})!)).toEqual({type: 'oops', isTypeError: true});
    expect(dec(enc({a: 1, b: 2})!)).toEqual({a: 1, b: 2});
    expect(dec(enc({})!)).toEqual({});
  });

  it('record-union binary keeps its discriminant and round-trips', () => {
    const enc = createBinaryEncoderFn<RecordUnion>();
    const dec = createBinaryDecoderFn<RecordUnion>();
    expect(dec(enc({type: 'oops', isTypeError: true}))).toEqual({type: 'oops', isTypeError: true});
    expect(dec(enc({a: 1, b: 2}))).toEqual({a: 1, b: 2});
  });

  it('pure object union {a: string} | {b: number} → bare object, no envelope', () => {
    const clone = createJsonEncoderFn<{a: string} | {b: number}>();
    const direct = createJsonEncoderFn<{a: string} | {b: number}>(undefined, {strategy: 'direct'});
    const mutate = createJsonEncoderFn<{a: string} | {b: number}>(undefined, {strategy: 'mutate'});

    for (const enc of [clone, direct, mutate]) {
      expect(enc({a: 'hi'})).toBe('{"a":"hi"}');
      expect(enc({b: 7})).toBe('{"b":7}');
      expect(enc({a: 'hi'})).not.toMatch(TOP_ENVELOPE);
      expect(enc({b: 7})).not.toMatch(TOP_ENVELOPE);
    }
  });

  it('mixed atomic + object union string | {a: number} → bare value, no envelope', () => {
    const clone = createJsonEncoderFn<string | {a: number}>();
    const dec = createJsonDecoderFn<string | {a: number}>();
    expect(clone('hi')).toBe('"hi"');
    expect(clone({a: 1})).toBe('{"a":1}');
    expect(clone('hi')).not.toMatch(TOP_ENVELOPE);
    expect(clone({a: 1})).not.toMatch(TOP_ENVELOPE);
    expect(dec(clone('hi')!)).toBe('hi');
    expect(dec(clone({a: 1})!)).toEqual({a: 1});
  });

  it('safe decoder still strips undeclared keys on a bare (un-enveloped) union wire', () => {
    // The envelope elision must not weaken decoder safety: the default (strip)
    // decoder still nukes keys the union never declared, now off the bare
    // merged object instead of the `[-1, …]` wrapper.
    const dec = createJsonDecoderFn<{a: string} | {b: number}>();
    const dirty = JSON.stringify({a: 'hi', evil: 'sneaky'});
    const back = dec(dirty) as Record<string, unknown>;
    expect(back.a).toBe('hi');
    expect(back.evil).toBeUndefined();
  });

  it('Record<string, Date> | {type, isTypeError} KEEPS the envelope (Date needs a transform)', () => {
    // The Date record member is non-JSON-compatible, so the union does NOT
    // round-trip raw — the envelope is required so the decoder knows to
    // reconstruct Dates. Round-trip must still be exact.
    type DateRecordUnion = Record<string, Date> | {type: string; isTypeError: true};
    const enc = createJsonEncoderFn<DateRecordUnion>();
    const dec = createJsonDecoderFn<DateRecordUnion>();

    const objWire = enc({type: 'oops', isTypeError: true})!;
    const recWire = enc({when: new Date('2020-01-02T03:04:05.000Z')})!;
    // Both arms are wrapped: object arm as `[-1, …]`, record arm as `[<idx>, …]`.
    expect(objWire).toMatch(TOP_ENVELOPE);
    expect(recWire).toMatch(TOP_ENVELOPE);

    expect(dec(objWire)).toEqual({type: 'oops', isTypeError: true});
    const restored = dec(recWire) as Record<string, Date>;
    expect(restored.when).toBeInstanceOf(Date);
    expect(restored.when.toISOString()).toBe('2020-01-02T03:04:05.000Z');
  });
});
