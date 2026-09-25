// A RegExp is not data: a pattern is code the receiver would run. Every codec drops a `RegExp` property like a
// function (same build Warning), `DataOnly` strips it, a mock skips it unless `nonDataTypes` is on, the clone shares
// it, and every family refuses it at the root (validate: VL001). Only a build-time `pattern` format reaches a validator.

import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  createRemoveUnknownKeysFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createValidateFn,
  type DataOnly,
} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

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

  it('validate refuses a RegExp at the root', () => {
    // @mion-downgrade-error VL001
    expect(() => createValidateFn<RegExp>()).toThrow(/VL001/);
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
      compact: createJsonEncoderFn<Rule>(undefined, {strategy: 'compact'}),
    };
    for (const [strategy, encode] of Object.entries(encoders)) {
      const text = encode(structuredClone(value)) as string;
      expect(text, strategy).not.toContain('a+');
    }
    const decode = createJsonDecoderFn<Rule>();
    expect(decode('{"name":"x"}')).toEqual({name: 'x'});
  });

  it('the exact-shape clone shares the RegExp by reference', () => {
    const clone = createRemoveUnknownKeysFn<Rule>();
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
