// A symbol literal is not data. The only value a decoder could hand back is a fresh `Symbol(...)`,
// never the symbol the literal type names, so every encoder and decoder refuses it exactly as it
// refuses the bare `symbol` kind: dropped at a property, alwaysThrow at a root. The validator keeps
// its in-memory description check, because nothing crosses the wire there.

import {describe, test, expect} from 'vitest';
import {
  createValidateFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
} from '@mionjs/run-types';

const sym = Symbol('hello');
type SymLiteral = typeof sym;

interface HasSymLiteral {
  tag: SymLiteral;
  name: string;
}

describe('symbol literal at a root', () => {
  test('every JSON strategy refuses it', () => {
    // @mion-downgrade-error PJS005
    expect(() => createJsonEncoderFn<SymLiteral>()).toThrow();
    // @mion-downgrade-error PJ005
    expect(() => createJsonEncoderFn<SymLiteral>(undefined, {strategy: 'mutate'})).toThrow();
    // @mion-downgrade-error SJ005
    expect(() => createJsonEncoderFn<SymLiteral>(undefined, {strategy: 'direct'})).toThrow();
    // @mion-downgrade-error RJ005
    expect(() => createJsonDecoderFn<SymLiteral>()).toThrow();
  });

  test('binary refuses it too', () => {
    // @mion-downgrade-error TB006
    expect(() => createBinaryEncoderFn<SymLiteral>()).toThrow();
    // @mion-downgrade-error FB006
    expect(() => createBinaryDecoderFn<SymLiteral>()).toThrow();
  });

  test('an array of one has no encodable element', () => {
    // @mion-downgrade-error PJS005
    expect(() => createJsonEncoderFn<SymLiteral[]>()).toThrow();
  });

  test('the validator still checks it by description', () => {
    // @mion-downgrade-error VL002
    const isit = createValidateFn<SymLiteral>();
    expect(isit(sym)).toBe(true);
    expect(isit(Symbol('nice'))).toBe(false);
    expect(isit('hello')).toBe(false);
  });
});

describe('symbol literal at a property', () => {
  test('the property is dropped and the object still encodes', () => {
    const encode = createJsonEncoderFn<HasSymLiteral>();
    expect(JSON.parse(encode({tag: sym, name: 'a'}) as string)).toEqual({name: 'a'});
  });

  test('every strategy drops it, never writes the description', () => {
    const value: HasSymLiteral = {tag: sym, name: 'a'};
    const encoded = [
      createJsonEncoderFn<HasSymLiteral>(undefined, {strategy: 'mutate'})({...value}),
      createJsonEncoderFn<HasSymLiteral>(undefined, {strategy: 'clone'})({...value}),
      createJsonEncoderFn<HasSymLiteral>(undefined, {strategy: 'direct'})({...value}),
    ];
    for (const json of encoded) {
      expect(json).not.toContain('Symbol');
      expect(json).not.toContain('hello');
    }
  });

  // DataOnly<HasSymLiteral> is `{name: string}`, so the decoder's own return type has
  // no `tag` on it. Reading one is a compile error, which is the point: the type and
  // the runtime now say the same thing.
  test('a decoded object has no tag at all', () => {
    const decoded = createJsonDecoderFn<HasSymLiteral>()(createJsonEncoderFn<HasSymLiteral>()({tag: sym, name: 'a'}) as string);
    expect(decoded).toEqual({name: 'a'});
    expect('tag' in decoded).toBe(false);
  });

  test('binary drops it the same way', () => {
    const decoded = createBinaryDecoderFn<HasSymLiteral>()(createBinaryEncoderFn<HasSymLiteral>()({tag: sym, name: 'a'}));
    expect(decoded).toEqual({name: 'a'});
    expect('tag' in decoded).toBe(false);
  });
});

describe('symbol literal in a union', () => {
  test('Date | typeof sym round-trips the Date', () => {
    const date = new Date('2020-01-01T00:00:00.000Z');
    const encode = createJsonEncoderFn<Date | SymLiteral>();
    const decode = createJsonDecoderFn<Date | SymLiteral>();
    expect(decode(encode(date) as string)).toEqual(date);
  });
});
