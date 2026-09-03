// The `strip` strategy promises to blank undeclared keys at every level. On
// the wire a Map is an array of pairs and a Set an array of items, and the
// wire-side pass used to skip both, so an extra key on an object inside a Map
// value or a Set member rode through `strip` untouched (an own `__proto__` key
// included). Found by the secjson lane's prototype oracle once it covered the
// encoders; this is the seed-free repro. `strip` sets an undeclared key to
// `undefined` rather than deleting it, so the checks read the value.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createParseFn} from '@mionjs/run-types';

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

describe('strip blanks undeclared keys inside Map values and Set members', () => {
  it('the strip decoder blanks the extras on every nested object', () => {
    const decode = createJsonDecoderFn<Holder>(undefined, {strategy: 'strip'});
    const out = decode(wire);
    const [item] = [...out.items] as Loose[];
    expect(item.n).toBe(1);
    expect(item.extra).toBeUndefined();
    expect(Object.getPrototypeOf(item)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(item, '__proto__')?.value).toBeUndefined();
    expect((out.lookup.get('k') as Loose).extra).toBeUndefined();
    expect(([...out.nested.get('k')!][0] as Loose).extra).toBeUndefined();
    expect(({} as {admin?: boolean}).admin).toBeUndefined();
  });

  it('parse with the strip strategy does the same', () => {
    const parse = createParseFn<Holder>(undefined, {strategy: 'strip'});
    const out = parse(JSON.parse(wire));
    expect(([...out.items][0] as Loose).extra).toBeUndefined();
    expect((out.lookup.get('k') as Loose).extra).toBeUndefined();
  });

  it('preserve keeps the extras, as documented', () => {
    const decode = createJsonDecoderFn<Holder>(undefined, {strategy: 'preserve'});
    const [item] = [...decode(wire).items] as Loose[];
    expect(item.extra).toBe('x');
  });
});
