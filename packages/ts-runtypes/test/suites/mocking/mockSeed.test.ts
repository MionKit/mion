// Seeded, repeatable mock data: `createMockDataFn(..., { mock: { seed } })` must
// produce the SAME value for the same seed across every kind, differ across
// seeds, and stay random with no seed. The broad kind sweep runs schema-first
// (RT / TF / TFT builders carry their own runtype, so no plugin is needed); a
// second block drives the plugin to pin BOTH createMockDataFn call shapes (static
// `<T>()` and value-first) and their convergence — the marker coverage rule.
//
// A fresh factory per call is deliberate: it exercises the per-invocation reset
// (the same seed reproduces the same value even across separate factories).

import {describe, it, expect} from 'vitest';
import {createMockDataFn} from '@mionjs/run-types';
import type {RunType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import * as TFT from '@mionjs/run-types/formats/temporal';
// Side-effect import: registers the per-kind format mock fns (without it every
// format mocks as a plain random string). Also needed by the plugin block below.
import '@mionjs/run-types/formats';

function gen(schema: RunType<unknown>, seed: number | undefined): unknown {
  return createMockDataFn(schema, {mock: {seed}})();
}

// A deep composite spanning the atomic kinds, formats (uuid v4/v7, date), a
// nested object/array, and a discriminated union.
const composite = RT.object({
  n: TF.number(),
  s: TF.string(),
  big: TF.bigInt(),
  b: RT.boolean(),
  u4: TF.uuidv4(),
  u7: TF.uuidv7(),
  when: TF.date(),
  list: RT.array(TF.number()),
  nested: RT.object({inner: RT.array(RT.object({x: TF.string(), y: TF.number()}))}),
  shape: RT.union([
    RT.object({kind: RT.literal('circle'), radius: TF.number()}),
    RT.object({kind: RT.literal('rect'), width: TF.number(), height: TF.number()}),
    RT.object({kind: RT.literal('text'), content: TF.string()}),
  ]),
});

describe('seeded mock data — same seed ⇒ identical value', () => {
  it('reproduces a deep composite (primitives, uuid v4/v7, date, array, object, discriminated union)', () => {
    expect(gen(composite, 12345)).toEqual(gen(composite, 12345));
  });

  it('reproduces each atomic kind and format independently', () => {
    const cases: Array<[string, RunType<unknown>]> = [
      ['number', TF.number()],
      ['string', TF.string()],
      ['bigint', TF.bigInt()],
      ['boolean', RT.boolean()],
      ['uuid v4', TF.uuidv4()],
      ['uuid v7', TF.uuidv7()],
      ['date', TF.date()],
      ['array', RT.array(TF.string())],
    ];
    for (const [name, schema] of cases) {
      expect(gen(schema, 999), name).toEqual(gen(schema, 999));
    }
  });

  it('reproduces Temporal values (compared by string — instances are not structurally deep-equal)', () => {
    for (const schema of [TFT.plainDate(), TFT.instant(), TFT.plainDateTime()]) {
      expect(String(gen(schema, 42))).toBe(String(gen(schema, 42)));
    }
  });
});

describe('seeded mock data — seed changes and no-seed randomness', () => {
  it('different seed ⇒ different value', () => {
    expect(gen(composite, 1)).not.toEqual(gen(composite, 2));
  });

  it('no seed ⇒ still random (two no-seed generations differ)', () => {
    expect(gen(composite, undefined)).not.toEqual(gen(composite, undefined));
  });
});

describe('seed honored from factory and per-call options (call overrides factory)', () => {
  it('a factory seed reproduces across separate factories', () => {
    const a = createMockDataFn(composite, {mock: {seed: 7}});
    const b = createMockDataFn(composite, {mock: {seed: 7}});
    expect(a()).toEqual(b());
  });

  it('a per-call seed overrides the factory seed', () => {
    const factory = createMockDataFn(composite, {mock: {seed: 7}});
    const viaCall = factory({mock: {seed: 9}});
    const viaSeed9 = createMockDataFn(composite, {mock: {seed: 9}})();
    expect(viaCall).toEqual(viaSeed9); // the per-call seed 9 wins
    expect(viaCall).not.toEqual(factory()); // and differs from the factory seed 7
  });
});

// Marker coverage rule: BOTH createMockDataFn call shapes, plus a per-form
// convergence assert. These use the plugin (it injects the runtype id / tuple),
// like test/features/mockSoundness.test.ts.
describe('both createMockDataFn call shapes are seed-deterministic and converge', () => {
  interface Point {
    x: number;
    y: number;
    label: string;
    tags: string[];
  }
  const sample: Point = {x: 0, y: 0, label: '', tags: []};

  it('static createMockDataFn<T>() reproduces with a seed', () => {
    const a = createMockDataFn<Point>(undefined, {mock: {seed: 555}})();
    const b = createMockDataFn<Point>(undefined, {mock: {seed: 555}})();
    expect(a).toEqual(b);
  });

  it('value-first createMockDataFn(value) reproduces with a seed', () => {
    const a = createMockDataFn(sample, {mock: {seed: 555}})();
    const b = createMockDataFn(sample, {mock: {seed: 555}})();
    expect(a).toEqual(b);
  });

  it('the two shapes converge on the same value for equivalent T and seed', () => {
    const viaStatic = createMockDataFn<Point>(undefined, {mock: {seed: 555}})();
    const viaValue = createMockDataFn(sample, {mock: {seed: 555}})();
    expect(viaStatic).toEqual(viaValue);
  });
});
