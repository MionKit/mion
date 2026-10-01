// An optional non-data member drops from DataOnly<T> as from the validator: never `p?: undefined`, never kept by an all-optional type.

import {describe, expect, it} from 'vitest';
import {createValidateFn, type DataOnly} from '@mionjs/run-types';

type WithOptionalPromise = {a: string; p?: Promise<number>; cb?: () => void};
const carrying = {a: 'x', p: Promise.resolve(1), cb: () => undefined};

describe('DataOnly — an optional non-data member', () => {
  it('validates like T on a value carrying the member (static shape)', () => {
    const isType = createValidateFn<WithOptionalPromise>();
    const isDataOnly = createValidateFn<DataOnly<WithOptionalPromise>>();
    expect(isType(carrying)).toBe(true);
    expect(isDataOnly(carrying)).toBe(true);
    expect(isDataOnly({a: 1})).toBe(false);
  });

  it('validates like T on a value carrying the member (value shape)', () => {
    const sample: DataOnly<WithOptionalPromise> = {a: 'x'};
    const isDataOnly = createValidateFn(sample);
    expect(isDataOnly(carrying)).toBe(true);
    expect(isDataOnly({a: 1})).toBe(false);
  });

  it('drops a function from a type whose members are all optional', () => {
    type Options = {cb?: () => void; name?: string};
    const isDataOnly = createValidateFn<DataOnly<Options>>();
    expect(isDataOnly({cb: () => undefined, name: 'x'})).toBe(createValidateFn<Options>()({cb: () => undefined, name: 'x'}));
    const sample: DataOnly<Options> = {name: 'x'};
    expect(createValidateFn(sample)({cb: () => undefined})).toBe(true);
  });

  it('keeps a written optional undefined', () => {
    const isDataOnly = createValidateFn<DataOnly<{a: string; u?: undefined}>>();
    expect(isDataOnly({a: 'x', u: 1})).toBe(false);
  });
});
