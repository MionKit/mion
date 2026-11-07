// Two index signatures with the same value type, as the resolver splits `Record<string | number, T>`: a for-in reaches
// every key in both, so the second one used to write and check each value again, and report a bad value twice.
import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn} from '@mionjs/run-types';

type Split = {[k: string]: string; [k: number]: string};

describe('repeated index signature', () => {
  it('reports one error per bad value', () => {
    const getErrors = createGetValidationErrorsFn<Split>();
    expect(getErrors({a: 1, 0: 'zero'})).toEqual([{path: ['a'], expected: 'string'}]);
    expect(createGetValidationErrorsFn<Record<string | number, string>>()({a: 1})).toEqual([{path: ['a'], expected: 'string'}]);
  });
});
