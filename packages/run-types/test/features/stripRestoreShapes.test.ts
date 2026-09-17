// The strip restore (`rjs`, what mion's `clone` strategy decodes with) rebuilds every object from
// the declared shape. These are the shapes where "declared" is not a plain property list: an index
// signature, a Map value and a registered class. Both marker call shapes per shape, paired, the
// way the marker coverage rule asks.

import {describe, expect, it} from 'vitest';
import {
  createJsonDecoderFn,
  createJsonEncoderFn,
  createValidateFn,
  getRTFunction,
  registerClassSerializer,
  type InjectTypeFnArgs,
} from '../../src/index.ts';

// `_val` only lets the reflection call shape infer T from a value; it is never read.
function recoverStripRestore<T>(_val?: T, id?: InjectTypeFnArgs<T, 'restoreFromJsonStrip'>) {
  return getRTFunction<'restoreFromJsonStrip'>(id);
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

// A template-literal index signature is open on every road, exactly like a plain one: the pattern
// picks the value transform for the keys it matches, a key matching no pattern rides through every
// encoder and every decoder untouched, and validation is the only place that refuses it.
describe('a pattern index signature is open on every road', () => {
  const wide = {d_1: 1, x: 2} as unknown as Patterned;

  // The strategy is a build-time literal: passing it as a variable resolves to no strategy and the
  // call silently falls back, so each one is spelled out at its own call site.
  it('the clone, direct and compact encoders write the non-matching key', () => {
    const clone = createJsonEncoderFn<Patterned>(undefined, {strategy: 'clone'})(wide) as string;
    const direct = createJsonEncoderFn<Patterned>(undefined, {strategy: 'direct'})(wide) as string;
    const compact = createJsonEncoderFn<Patterned>(undefined, {strategy: 'compact'})(wide) as string;
    expect(JSON.parse(clone), 'clone').toStrictEqual({d_1: 1, x: 2});
    expect(JSON.parse(direct), 'direct').toStrictEqual({d_1: 1, x: 2});
    expect(JSON.parse(compact), 'compact').toStrictEqual({d_1: 1, x: 2});
  });

  it('the strip, compact and clone decoders return the non-matching key', () => {
    expect(createJsonDecoderFn<Patterned>(undefined, {strategy: 'strip'})('{"d_1":1,"x":2}')).toStrictEqual({d_1: 1, x: 2});
    expect(createJsonDecoderFn<Patterned>(undefined, {strategy: 'compact'})('{"d_1":1,"x":2}')).toStrictEqual({d_1: 1, x: 2});
    expect(recoverStripRestore<Patterned>()({d_1: 1, x: 2})).toStrictEqual({d_1: 1, x: 2});
  });

  it('validation is where the non-matching key is refused', () => {
    expect(createValidateFn<Patterned>()({d_1: 1})).toBe(true);
    expect(createValidateFn<Patterned>()(wide)).toBe(false);
  });
});

// An object runs ONE key sweep for all its index signatures. TypeScript splits `Record<string |
// number, V>` into a string half and a number half, and the direct encoder used to sweep once per
// half and write every key twice. A round trip cannot catch that: JSON.parse keeps the last of two
// equal keys, so only the wire string shows it.
describe('a split key sweeps once', () => {
  type Split = {[key: string]: string; [key: number]: string};
  const value = {a: 'x', 1: 'y'} as unknown as Split;

  it('the direct encoder writes each key once', () => {
    const wire = createJsonEncoderFn<Split>(undefined, {strategy: 'direct'})(value) as string;
    expect(wire.match(/"a":/g)).toHaveLength(1);
    expect(wire.match(/"1":/g)).toHaveLength(1);
    expect(JSON.parse(wire)).toStrictEqual({a: 'x', 1: 'y'});
  });

  it('every other encoder writes each key once too', () => {
    const clone = createJsonEncoderFn<Split>(undefined, {strategy: 'clone'})(structuredClone(value)) as string;
    const mutate = createJsonEncoderFn<Split>(undefined, {strategy: 'mutate'})(structuredClone(value)) as string;
    const compact = createJsonEncoderFn<Split>(undefined, {strategy: 'compact'})(structuredClone(value)) as string;
    for (const [name, wire] of [
      ['clone', clone],
      ['mutate', mutate],
      ['compact', compact],
    ] as const) {
      expect(wire.match(/"a":/g), name).toHaveLength(1);
      expect(JSON.parse(wire), name).toStrictEqual({a: 'x', 1: 'y'});
    }
  });
});
