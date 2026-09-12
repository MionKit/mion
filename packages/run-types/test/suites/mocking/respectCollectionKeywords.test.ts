// Mock soundness for the COLLECTION keywords in COMBINATION — `uniqueItems`
// together with the count bounds, and with `contains` / `minContains` /
// `maxContains` — across all three collection families.
//
// Why a separate file rather than more cases in the format-validation matrix:
// that matrix pins each keyword on its own, one draw per lane. What can only
// break in combination is the SHAPE of the draw, and that needs many draws. The
// generator does not reject-sample its way to `maxContains: 1`; it places
// exactly `minContains` matching entries and then fills with entries the matcher
// definitively rejects, so the per-entry counts are exact by construction. These
// tests assert that construction holds over 200 draws, per shape.
//
// Distinctness is checked with a LOCAL JSON key rather than the walker's own
// canonical form, so the assertion is not the code under test. That is sound
// here only because every drawn object comes from one shape and so has one fixed
// key order.

import {describe, it, expect} from 'vitest';
import {createMockDataFn, createValidateFn, type DataOnly} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';

const DRAWS = 200;

const entriesOf = (value: unknown): unknown[] => {
  if (value instanceof Map) return [...value];
  if (value instanceof Set) return [...value];
  return value as unknown[];
};
// A PRIMITIVE is keyed by its type and text, an object by its JSON. Both halves
// are needed for a wide (`unknown`) member: plain `JSON.stringify` has no form
// for a bigint (it throws) and renders NaN / Infinity / null all as `null`, so a
// Set legitimately holding several of those looked like a repeat. Nested
// non-finite numbers would still collide, which is fine because the object
// shapes drawn here carry finite ones.
const jsonKey = (item: unknown): string => {
  if (item === null || typeof item !== 'object') return `${typeof item}:${String(item)}`;
  return JSON.stringify(item, (_key, value) => (typeof value === 'bigint' ? {bigint: value.toString()} : value)) ?? 'undefined';
};
const allDistinct = (items: readonly unknown[]): boolean => new Set(items.map(jsonKey)).size === items.length;

describe('mock: uniqueItems together with the count bounds', () => {
  // One bag, the three families. Every draw must validate, sit inside the
  // bounds, and hold no two entries equal by value.
  const cases = [
    ['array', RT.array(RT.object({id: TF.number()}), {minItems: 3, maxItems: 5, uniqueItems: true})],
    ['set', RT.set(RT.object({id: TF.number()}), {minItems: 3, maxItems: 5, uniqueItems: true})],
    ['map', RT.map(RT.object({id: TF.number()}), TF.string(), {minItems: 3, maxItems: 5, uniqueItems: true})],
  ] as const;

  for (const [family, schema] of cases) {
    it(`${family}: every draw validates, fits 3..5 entries and repeats nothing`, () => {
      const validate = createValidateFn(schema);
      const mock = createMockDataFn(schema);
      for (let i = 0; i < DRAWS; i++) {
        const value = mock();
        expect(validate(value)).toBe(true);
        const entries = entriesOf(value);
        expect(entries.length).toBeGreaterThanOrEqual(3);
        expect(entries.length).toBeLessThanOrEqual(5);
        expect(allDistinct(entries)).toBe(true);
      }
    });
  }
});

describe('mock: uniqueItems together with contains', () => {
  it('a Set reaches minContains 2 while staying unique by value', () => {
    const schema = RT.set(RT.unknown(), {uniqueItems: true, minItems: 2, contains: TF.number(), minContains: 2});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema);
    for (let i = 0; i < DRAWS; i++) {
      const value = mock() as Set<unknown>;
      expect(validate(value)).toBe(true);
      const members = [...value];
      expect(members.filter((member) => typeof member === 'number').length).toBeGreaterThanOrEqual(2);
      expect(allDistinct(members)).toBe(true);
    }
  });

  // A Map's entry is its `[key, value]` pair, so the contains child is a tuple
  // and the count is over pairs.
  it('a Map reaches minContains 2 on the value half while staying unique by pair', () => {
    const schema = RT.map(TF.string(), TF.number(), {
      uniqueItems: true,
      minItems: 2,
      contains: RT.tuple({required: [RT.unknown(), RT.literal(100)]}),
      minContains: 2,
    });
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema);
    for (let i = 0; i < DRAWS; i++) {
      const value = mock() as Map<string, number>;
      expect(validate(value)).toBe(true);
      const entries = [...value];
      expect(entries.filter(([, score]) => score === 100).length).toBeGreaterThanOrEqual(2);
      expect(allDistinct(entries)).toBe(true);
    }
  });

  // maxContains is the one a rejection sampler would never hit reliably: the
  // count has to be EXACT, which is why fillers that match are dropped.
  it('a Map holds exactly one maxContains match, never a second by accident', () => {
    const schema = RT.map(TF.string(), TF.number(), {
      uniqueItems: true,
      minItems: 3,
      contains: RT.tuple({required: [RT.unknown(), RT.literal(100)]}),
      maxContains: 1,
    });
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema);
    for (let i = 0; i < DRAWS; i++) {
      const value = mock() as Map<string, number>;
      expect(validate(value)).toBe(true);
      expect([...value].filter(([, score]) => score === 100).length).toBe(1);
      expect(value.size).toBeGreaterThanOrEqual(3);
    }
  });
});

// The type-first road reaches the same walker through the reflected type, so it
// must draw just as soundly. One per family, the same combined bag.
type UniqueArr = TF.FormattedArray<{id: number}[], {minItems: 3; maxItems: 5; uniqueItems: true}>;
type UniqueSet = TF.FormattedSet<Set<{id: number}>, {minItems: 3; maxItems: 5; uniqueItems: true}>;
type UniqueMap = TF.FormattedMap<Map<{id: number}, string>, {minItems: 3; maxItems: 5; uniqueItems: true}>;

describe('mock: the type-first spelling draws the same', () => {
  const cases = [
    ['FormattedArray', createValidateFn<UniqueArr>(), createMockDataFn<UniqueArr>()],
    ['FormattedSet', createValidateFn<UniqueSet>(), createMockDataFn<UniqueSet>()],
    ['FormattedMap', createValidateFn<UniqueMap>(), createMockDataFn<UniqueMap>()],
  ] as const;

  for (const [label, validate, mock] of cases) {
    it(`${label}: every draw validates, fits 3..5 entries and repeats nothing`, () => {
      for (let i = 0; i < DRAWS; i++) {
        const value = mock();
        expect(validate(value as never)).toBe(true);
        const entries = entriesOf(value);
        expect(entries.length).toBeGreaterThanOrEqual(3);
        expect(entries.length).toBeLessThanOrEqual(5);
        expect(allDistinct(entries)).toBe(true);
      }
    });
  }

  // The DataOnly projection of a branded collection keeps the brand, so its
  // validator carries the same keywords and the same draw has to satisfy it.
  it('the DataOnly projection keeps the keywords', () => {
    const validate = createValidateFn<DataOnly<UniqueSet>>();
    const mock = createMockDataFn<UniqueSet>();
    for (let i = 0; i < DRAWS; i++) expect(validate(mock() as never)).toBe(true);
  });
});

// A shape whose constraints cannot all hold must FAIL LOUDLY rather than ship a
// value its own validator rejects. Three ways to be unsatisfiable, one message
// each: too few distinct values to reach minItems, and the two collapse cases
// where the collection itself dedupes the matches a minContains asked for.
describe('mock: an unsatisfiable combination throws instead of shipping a bad value', () => {
  it('a Set of booleans cannot hold 3 distinct members', () => {
    // Only `true` and `false` exist, so minItems 3 under uniqueItems is empty.
    const mock = createMockDataFn(RT.set(RT.boolean(), {minItems: 3, uniqueItems: true}));
    expect(() => mock()).toThrow(/Cannot mock a structural format/);
  });

  it('a Map holds one entry per key, so a pinned key cannot reach minContains 2', () => {
    const mock = createMockDataFn(
      RT.map(TF.string(), TF.number(), {
        contains: RT.tuple({required: [RT.literal('admin'), RT.unknown()]}),
        minContains: 2,
      })
    );
    expect(() => mock()).toThrow(/a Map holds one entry per key/);
  });

  it('a Set holds one copy of a member, so a pinned member cannot reach minContains 2', () => {
    const mock = createMockDataFn(RT.set(TF.string(), {contains: RT.literal('admin'), minContains: 2}));
    expect(() => mock()).toThrow(/a Set holds one copy of a member/);
  });
});
