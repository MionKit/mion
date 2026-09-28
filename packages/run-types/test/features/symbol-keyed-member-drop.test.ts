// A symbol-keyed member is not data: DataOnly drops it, so every family drops it too. Before, the member was
// compiled as a string property named by the checker's internal spelling, so a validator required a key no
// real object has and an encoder read `undefined` from it.

import {describe, expect, test} from 'vitest';
import {
  createGetValidationErrorsFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createRemoveUnknownKeysFn,
  createValidateFn,
  getRunTypeId,
} from '@mionjs/run-types';

const tag = Symbol('tag');
interface Tagged {
  name: string;
  [tag]: string;
}

describe('symbol-keyed member drop', () => {
  test('validate checks the data members and ignores the symbol key', () => {
    const isTagged = createValidateFn<Tagged>();
    expect(isTagged({name: 'a', [tag]: 'x'})).toBe(true);
    expect(isTagged({name: 'a'})).toBe(true);
    expect(isTagged({name: 1})).toBe(false);
  });

  test('getValidationErrors reports nothing for the symbol key', () => {
    const errors = createGetValidationErrorsFn<Tagged>();
    expect(errors({name: 'a', [tag]: 'x'})).toEqual([]);
  });

  test('JSON round-trips the data members only', () => {
    const encode = createJsonEncoderFn<Tagged>();
    const decode = createJsonDecoderFn<Tagged>();
    const json = encode({name: 'a', [tag]: 'x'}) as string;
    expect(JSON.parse(json)).toEqual({name: 'a'});
    expect(decode(json)).toEqual({name: 'a'});
  });

  test('removeUnknownKeys keeps the data members and adds no key of its own', () => {
    const strip = createRemoveUnknownKeysFn<Tagged>();
    const clean = strip({name: 'a', [tag]: 'x', extra: 1} as Tagged) as Record<string, unknown>;
    expect(Object.keys(clean)).toEqual(['name']);
  });

  // Marker coverage rule: both getRunTypeId shapes name the same type.
  test('both getRunTypeId shapes resolve to one id', () => {
    const sample: Tagged = {name: 'a', [tag]: 'x'};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<Tagged>());
  });
});
