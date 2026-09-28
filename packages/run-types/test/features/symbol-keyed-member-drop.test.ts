// A symbol-keyed member is not data, so every family drops it like DataOnly. Compiled as a string key (the checker's
// internal spelling), a validator required a key no real object has and an encoder read `undefined`.

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
    const isWrapped = createValidateFn<{inner: Tagged}>(undefined, {checkUnknowns: true});
    expect(isWrapped({inner: {name: 'a', [tag]: 'x'}})).toBe(true);
  });

  test('JSON round-trips the data members only', () => {
    const encode = createJsonEncoderFn<Tagged>();
    const decode = createJsonDecoderFn<Tagged>();
    const json = encode({name: 'a', [tag]: 'x'}) as string;
    expect(JSON.parse(json)).toEqual({name: 'a'});
    expect(decode(json)).toEqual({name: 'a'});
  });

  test('removeUnknownKeys refuses: its copy is typed Tagged, so it cannot drop the symbol key', () => {
    // @mion-downgrade-error RUK004
    expect(() => createRemoveUnknownKeysFn<Tagged>()).toThrow(/RUK004/);
  });

  test('strict validation ignores the symbol key, it never counts as a declared key', () => {
    const isTagged = createValidateFn<Tagged>(undefined, {checkUnknowns: true});
    const errors = createGetValidationErrorsFn<Tagged>(undefined, {checkUnknowns: true});
    expect(isTagged({name: 'a', [tag]: 'x'})).toBe(true);
    expect(isTagged({name: 'a', extra: 1})).toBe(false);
    expect(errors({name: 'a', [tag]: 'x'})).toEqual([]);
  });

  test('a union of arms that all declare the symbol key round-trips its data members only', () => {
    type Shape = {kind: 'a'; name: string; [tag]: string} | {kind: 'b'; size: number; [tag]: string};
    const encode = createJsonEncoderFn<Shape>();
    const decode = createJsonDecoderFn<Shape>();
    const json = encode({kind: 'a', name: 'x', [tag]: 't'}) as string;
    expect(JSON.parse(json)).toEqual({kind: 'a', name: 'x'});
    expect(Object.keys(decode(json))).toEqual(['kind', 'name']);
  });

  // Marker coverage rule: both getRunTypeId shapes name the same type.
  test('both getRunTypeId shapes resolve to one id', () => {
    const sample: Tagged = {name: 'a', [tag]: 'x'};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<Tagged>());
  });
});
