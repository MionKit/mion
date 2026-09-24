// The `clone` decoder drops undeclared keys at every level, Map values and Set members included.
// An own `__proto__` key is the case that matters: it must never survive.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn} from '@mionjs/run-types';

interface Item {
  n: number;
}
interface Holder {
  items: Set<Item>;
  lookup: Map<string, Item>;
  nested: Map<string, Set<Item>>;
}

type Loose = Item & {extra?: string; __proto__?: unknown};

const wire = JSON.stringify({
  items: [{n: 1, extra: 'x', __proto__: {admin: true}}],
  lookup: [['k', {n: 2, extra: 'y'}]],
  nested: [['k', [{n: 3, extra: 'z'}]]],
});

describe('clone drops undeclared keys inside Map values and Set members', () => {
  it('the clone decoder drops the extras on every nested object', () => {
    const decode = createJsonDecoderFn<Holder>(undefined, {strategy: 'clone'});
    const out = decode(wire);
    const [item] = [...out.items] as Loose[];
    expect(item).toStrictEqual({n: 1});
    expect(Object.getPrototypeOf(item)).toBe(Object.prototype);
    expect(Object.hasOwn(item, '__proto__')).toBe(false);
    expect(out.lookup.get('k')).toStrictEqual({n: 2});
    expect([...out.nested.get('k')!][0]).toStrictEqual({n: 3});
    expect(({} as {admin?: boolean}).admin).toBeUndefined();
  });

  it('mutate keeps the extras, as documented', () => {
    const decode = createJsonDecoderFn<Holder>(undefined, {strategy: 'mutate'});
    const [item] = [...decode(wire).items] as Loose[];
    expect(item.extra).toBe('x');
  });
});
