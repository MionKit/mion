// Pins that a RegExp value is not data. A pattern is code the receiver would
// run, so it never rides the wire: a `RegExp` property is dropped by every
// codec like a function-valued one (with the same build Warning), `DataOnly`
// strips it, a mock leaves it out unless `nonDataTypes` is on, and the clone
// shares it by reference. `validate` still checks a RegExp by identity, so a
// root `createValidateFn<RegExp>()` keeps working. The only regex that reaches
// a validator is a `pattern` format, fixed at build time.

import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  createBinaryDecoderFn,
  createBinaryEncoderFn,
  createCloneExactShapeFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createMockDataFn,
  createValidateFn,
  type DataOnly,
} from '@mionjs/run-types';

interface Rule {
  name: string;
  match: RegExp;
}

describe('RegExp is not data', () => {
  it('DataOnly strips a RegExp property and a RegExp root', () => {
    expectTypeOf<DataOnly<Rule>>().toEqualTypeOf<{name: string}>();
    expectTypeOf<DataOnly<RegExp>>().toEqualTypeOf<never>();
    expectTypeOf<DataOnly<{items: RegExp[]}>>().toEqualTypeOf<{items: never[]}>();
  });

  it('validate keeps checking a RegExp by identity at the root', () => {
    const validate = createValidateFn<RegExp>();
    expect(validate(/a/)).toBe(true);
    expect(validate('/a/')).toBe(false);
  });

  it('validate ignores a RegExp property like a function-valued one', () => {
    const validate = createValidateFn<Rule>();
    expect(validate({name: 'x', match: /a/})).toBe(true);
    expect(validate({name: 'x'})).toBe(true);
    expect(validate({name: 'x', match: '/a/'})).toBe(true);
  });

  it('the JSON codecs drop the property on every strategy', () => {
    const value: Rule = {name: 'x', match: /a+/gi};
    const encoders = {
      clone: createJsonEncoderFn<Rule>(undefined, {strategy: 'clone'}),
      mutate: createJsonEncoderFn<Rule>(undefined, {strategy: 'mutate'}),
      direct: createJsonEncoderFn<Rule>(undefined, {strategy: 'direct'}),
      compact: createJsonEncoderFn<Rule>(undefined, {strategy: 'compact'}),
    };
    for (const [strategy, encode] of Object.entries(encoders)) {
      const text = encode(structuredClone(value)) as string;
      expect(text, strategy).not.toContain('a+');
    }
    const decode = createJsonDecoderFn<Rule>();
    expect(decode('{"name":"x"}')).toEqual({name: 'x'});
  });

  it('the binary codec drops the property', () => {
    const encode = createBinaryEncoderFn<Rule>();
    const decode = createBinaryDecoderFn<Rule>();
    expect(decode(encode({name: 'x', match: /a/}))).toEqual({name: 'x'});
  });

  it('the exact-shape clone shares the RegExp by reference', () => {
    const clone = createCloneExactShapeFn<Rule>();
    const value: Rule = {name: 'x', match: /a/};
    const out = clone(value);
    expect(out).not.toBe(value);
    expect(out.match).toBe(value.match);
  });

  it('a mock carries a RegExp only with nonDataTypes on', () => {
    const plain = createMockDataFn<Rule>()() as Partial<Rule>;
    expect(plain.match).toBeUndefined();
    const nonData = createMockDataFn<Rule>(undefined, {mock: {nonDataTypes: true}})();
    expect(nonData.match).toBeInstanceOf(RegExp);
  });
});
