// Records what a symbol literal does on the wire TODAY, before the encoding changes.
// The JSON road writes `'Symbol:' + description` and the decoder rebuilds with a fresh
// `Symbol(...)`; binary writes nothing and rebuilds from the type. Both hand back a symbol that
// is not the one the literal type names, and the validator still accepts it because it only
// compares `.description`.

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

describe('symbol literal on the wire (current behaviour)', () => {
  test('JSON round-trip returns a DIFFERENT symbol', () => {
    const encode = createJsonEncoderFn<SymLiteral>();
    const decode = createJsonDecoderFn<SymLiteral>();
    const restored = decode(encode(sym) as string);

    expect(typeof restored).toBe('symbol');
    expect((restored as symbol).description).toBe('hello');
    expect(restored).not.toBe(sym);
  });

  test('the wire form is the description string', () => {
    const encode = createJsonEncoderFn<SymLiteral>();
    expect(JSON.parse(encode(sym) as string)).toBe('Symbol:hello');
  });

  test('a symbol-literal property is written as that string, not dropped', () => {
    const encode = createJsonEncoderFn<HasSymLiteral>();
    expect(JSON.parse(encode({tag: sym, name: 'a'}) as string)).toEqual({tag: 'Symbol:hello', name: 'a'});
  });

  test('binary round-trip also returns a DIFFERENT symbol', () => {
    const restored = createBinaryDecoderFn<SymLiteral>()(createBinaryEncoderFn<SymLiteral>()(sym));
    expect(restored).not.toBe(sym);
    expect((restored as symbol).description).toBe('hello');
  });

  test('the validator accepts the rebuilt symbol, so nothing reports the swap', () => {
    // @mion-downgrade-error VL002
    const isit = createValidateFn<SymLiteral>();
    const decode = createJsonDecoderFn<SymLiteral>();
    const encode = createJsonEncoderFn<SymLiteral>();
    expect(isit(decode(encode(sym) as string))).toBe(true);
  });
});
