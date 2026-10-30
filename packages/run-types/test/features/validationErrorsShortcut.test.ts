// A getErrors call with no `errors` list asks the validator first where the walk costs more than it (a loop, a cycle,
// an unknown-key scan); a named child is walked only when its own validator rejects it. A caller's own list always gets
// the full walk.

import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, type RTValidationError} from '@mionjs/run-types';

interface Order {
  id: string;
  items: {sku: string; qty: number}[];
  note?: string;
}

interface TreeNode {
  label: string;
  children: TreeNode[];
}

// Its own shape: one structurally equal to Order's anonymous item would merge with it and lose the name.
export interface Item {
  code: string;
  count: number;
}

export interface Cart {
  items: Item[];
}

interface Profile {
  name: string;
  address: {city: string};
}

const getErrors = createGetValidationErrorsFn<Order>();
const getProfileErrors = createGetValidationErrorsFn<Profile>();
const getTreeErrors = createGetValidationErrorsFn<TreeNode>();
const getCartErrors = createGetValidationErrorsFn<Cart>();
const getStrictErrors = createGetValidationErrorsFn<Order>(undefined, {checkUnknowns: true});
const valid: Order = {id: 'o1', items: [{sku: 'a', qty: 1}]};

describe('validation errors shortcut', () => {
  // Whitespace stripped: the typed emit project reprints the code.
  const shortcut = /if\(er===undefined\)\{er=\[\];if\(\w+\.fn\(v\)\)returner;\}/;
  const body = (fn: (...args: any[]) => unknown) => fn.toString().replace(/\s/g, '');

  it('asks the validator before walking a cyclic type', () => {
    expect(body(getTreeErrors)).toMatch(shortcut);
    expect(getTreeErrors({label: 'a', children: [{label: 'b', children: []}]})).toEqual([]);
    expect(getTreeErrors({label: 'a', children: [{label: 1, children: []}]})).toEqual([
      {path: ['children', 0, 'label'], expected: 'string'},
    ]);
  });

  it('walks loop-free plain checks without asking the validator', () => {
    expect(body(getProfileErrors)).not.toMatch(shortcut);
    expect(getProfileErrors({name: 'a', address: {city: 1}})).toEqual([{path: ['address', 'city'], expected: 'string'}]);
  });

  it('asks the validator before a walk with a loop', () => {
    expect(body(getErrors)).toMatch(shortcut);
  });

  it('walks a named child only when its validator rejects it', () => {
    // Quotes and outer parens vary: the typed emit project reprints the code.
    expect(body(getCartErrors)).toMatch(
      /\w+\.fn\(v\.items\[i0\]\)\|\|\(pth\.push\(['"]items['"],i0\),\w+\.fn\(v\.items\[i0\],pth,er\),pth\.pop\(\),pth\.pop\(\)\)/
    );
    expect(
      getCartErrors({
        items: [
          {code: 'a', count: 1},
          {code: 2, count: 1},
        ],
      })
    ).toEqual([{path: ['items', 1, 'code'], expected: 'string'}]);
    expect(getCartErrors({items: [{code: 'a', count: 1}]}, ['root'])).toEqual([]);
    expect(getCartErrors({items: [{code: 'a', count: 'x'}]}, ['root'])).toEqual([
      {path: ['root', 'items', 0, 'count'], expected: 'number'},
    ]);
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
