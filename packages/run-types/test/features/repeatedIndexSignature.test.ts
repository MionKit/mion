// `Record<string | number, T>` splits into two signatures whose for-ins each reach every key: one bad value, two errors.
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
