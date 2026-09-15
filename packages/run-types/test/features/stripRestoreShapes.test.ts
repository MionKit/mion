// The strip restore (`rjs`, what mion's `clone` strategy decodes with) rebuilds every object from
// the declared shape. These are the shapes where "declared" is not a plain property list: an index
// signature, a Map value and a registered class. Both marker call shapes per shape, paired, the
// way the marker coverage rule asks.

import {describe, expect, it} from 'vitest';
import {createJsonEncoderFn, getRTFunction, registerClassSerializer, type InjectTypeFnArgs} from '../../src/index.ts';

// `_val` only lets the reflection call shape infer T from a value; it is never read.
function recoverStripRestore<T>(_val?: T, id?: InjectTypeFnArgs<T, 'rjs'>) {
  return getRTFunction<'rjs'>(id);
}

class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}
}
registerClassSerializer(Money, {
  serialize: (money) => ({amount: String(money.amount), currency: money.currency}),
  deserialize: (data) => new Money(Number(data.amount), data.currency),
});

type Patterned = Record<`d_${string}`, number>;
type Lookup = Map<string, {a: string}>;

describe('the strip restore keeps what the type declares', () => {
  // An index signature is open: whether `x` matches the pattern is validation's question, so the
  // restore keeps every key rather than guessing at one.
  it('static form: a pattern index signature keeps a non-matching key', () => {
    expect(recoverStripRestore<Patterned>()({d_1: 1, x: 2})).toStrictEqual({d_1: 1, x: 2});
  });

  it('reflection form: the same restore, resolved from a value', () => {
    const seed: Patterned = {d_1: 1};
    expect(recoverStripRestore(seed)).toBe(recoverStripRestore<Patterned>());
    expect(recoverStripRestore(seed)({d_1: 1, x: 2})).toStrictEqual({d_1: 1, x: 2});
  });

  // A Map rides the wire as `[key, value]` pairs; the value slot is a declared shape like any other.
  function lookupWireWithPlant(): unknown {
    const wire = JSON.parse(createJsonEncoderFn<Lookup>()(new Map([['k', {a: 'x'}]])) as string) as [
      string,
      Record<string, unknown>,
    ][];
    wire[0][1].evil = 1;
    return wire;
  }

  it('static form: an undeclared key inside a Map value is gone', () => {
    const restored = recoverStripRestore<Lookup>()(lookupWireWithPlant()) as Lookup;
    expect(restored).toBeInstanceOf(Map);
    expect(restored.get('k')).toStrictEqual({a: 'x'});
  });

  it('reflection form: the same restore for the Map, resolved from a value', () => {
    const seed: Lookup = new Map([['k', {a: 'x'}]]);
    expect(recoverStripRestore(seed)).toBe(recoverStripRestore<Lookup>());
    const restored = recoverStripRestore(seed)(lookupWireWithPlant()) as Lookup;
    expect(restored.get('k')).toStrictEqual({a: 'x'});
  });

  it('static form: a registered class comes back through its deserializer', () => {
    const wire = JSON.parse(createJsonEncoderFn<Money>()(new Money(5, 'USD')) as string);
    const restored = recoverStripRestore<Money>()(wire);
    expect(restored).toBeInstanceOf(Money);
    expect(restored).toStrictEqual(new Money(5, 'USD'));
  });

  it('reflection form: the same restore for the class, resolved from a value', () => {
    const seed = new Money(1, 'EUR');
    expect(recoverStripRestore(seed)).toBe(recoverStripRestore<Money>());
    const wire = JSON.parse(createJsonEncoderFn<Money>()(new Money(5, 'USD')) as string);
    expect(recoverStripRestore(seed)(wire)).toStrictEqual(new Money(5, 'USD'));
  });
});
