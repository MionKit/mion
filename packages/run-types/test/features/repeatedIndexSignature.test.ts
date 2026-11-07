// Two index signatures with the same value type, as the resolver splits `Record<string | number, T>`: a for-in reaches
// every key in both, so the second one used to write and check each value again, and report a bad value twice.
import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, createJsonDecoderFn, createJsonEncoderFn, createValidateFn} from '@mionjs/run-types';

type Split = {[k: string]: string; [k: number]: string};

describe('repeated index signature', () => {
  it('reports one error per bad value', () => {
    const getErrors = createGetValidationErrorsFn<Split>();
    expect(getErrors({a: 1, 0: 'zero'})).toEqual([{path: ['a'], expected: 'string'}]);
    expect(createGetValidationErrorsFn<Record<string | number, string>>()({a: 1})).toEqual([{path: ['a'], expected: 'string'}]);
  });

  it('validates every key once', () => {
    const isValid = createValidateFn<Split>();
    expect(isValid({a: 'x', 0: 'zero'})).toBe(true);
    expect(isValid({a: 'x', 0: 1})).toBe(false);
  });

  it('round trips through every encoder', () => {
    const value: Split = {key1: 'value1', 0: 'zero', 5: 'five'};
    const decode = createJsonDecoderFn<Split>();
    expect(decode(createJsonEncoderFn<Split>(undefined, {strategy: 'clone'})({...value}) as string)).toEqual(value);
    expect(decode(createJsonEncoderFn<Split>(undefined, {strategy: 'mutate'})({...value}) as string)).toEqual(value);
    const compact = createJsonEncoderFn<Split>(undefined, {strategy: 'compact'})({...value}) as string;
    expect(createJsonDecoderFn<Split>(undefined, {strategy: 'compact'})(compact)).toEqual(value);
  });
});
