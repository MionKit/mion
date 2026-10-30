// A getErrors call with no `errors` list asks the validator first; a caller's own list always gets the full walk.

import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, type RTValidationError} from '@mionjs/run-types';

interface Order {
  id: string;
  items: {sku: string; qty: number}[];
  note?: string;
}

const getErrors = createGetValidationErrorsFn<Order>();
const getStrictErrors = createGetValidationErrorsFn<Order>(undefined, {checkUnknowns: true});
const valid: Order = {id: 'o1', items: [{sku: 'a', qty: 1}]};

describe('validation errors shortcut', () => {
  it('asks the validator before building errors', () => {
    // Whitespace stripped: the typed emit project reprints the code.
    expect(getErrors.toString().replace(/\s/g, '')).toMatch(/if\(er===undefined\)\{er=\[\];if\(\w+\.fn\(v\)\)returner;\}/);
  });

  it('returns a fresh empty list per call for an accepted value', () => {
    const first = getErrors(valid);
    expect(first).toEqual([]);
    first.push({path: [], expected: 'x'});
    expect(getErrors(valid)).toEqual([]);
  });

  it('reports every error of a rejected value', () => {
    expect(getErrors({id: 1, items: [{sku: 'a', qty: 'x'}]})).toEqual([
      {path: ['id'], expected: 'string'},
      {path: ['items', 0, 'qty'], expected: 'number'},
    ]);
  });

  it("appends to the caller's list and prefixes the caller's path", () => {
    const seeded: RTValidationError[] = [{path: ['earlier'], expected: 'string'}];
    const out = getErrors({id: 1, items: []}, ['root'], seeded);
    expect(out).toBe(seeded);
    expect(out).toEqual([
      {path: ['earlier'], expected: 'string'},
      {path: ['root', 'id'], expected: 'string'},
    ]);
    expect(getErrors(valid, ['root'], seeded)).toBe(seeded);
    expect(getErrors({id: 1, items: []}, ['root'])).toEqual([{path: ['root', 'id'], expected: 'string'}]);
  });

  it('asks the strict validator under checkUnknowns', () => {
    expect(getStrictErrors(valid)).toEqual([]);
    expect(getStrictErrors({...valid, extra: 1})).toEqual([{path: ['extra'], expected: 'never'}]);
  });
});
