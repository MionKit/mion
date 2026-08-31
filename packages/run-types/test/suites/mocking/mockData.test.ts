// `MockData<T>` consumption by the mock walker. `createMockDataFn` needs the
// Vite-plugin-injected runtype graph, so these tests drive the lower-level
// `mockRunType(runType, options, [])` directly over hand-built RunType graphs +
// a MockData node — the same shape the plugin would feed in. Covers: string /
// number / Date / boolean / bigint pool selection, number + Date range bounds,
// array `rt$length` (fixed + range) and `rt$items`, nested object descent, and the
// strictly-additive no-data sanity case. Each assertion runs many iterations so
// the random generator can't pass by luck.
//
// SCOPE: these tests assert the walker's pool/range RESPECT only; they never run
// the type's own `createValidateFn` over a generated value, and they do NOT exercise
// the marker API (`createMockDataFn<T>()` static vs `createMockDataFn(value)` reflect).
// The positive mock→validate round-trip and the both-call-shape marker coverage
// live in the validation suite (`assertMockTypeStatic` / `assertMockTypeReflect`
// → `runMockPass`, which calls the paired validator). Don't read these unit tests
// as covering that round-trip.

import {describe, it, expect} from 'vitest';
import {mockRunType} from '../../../src/mocking/mockType.ts';
import {defaultMockOptions} from '../../../src/mocking/constants.mock.ts';
import type {MockDataNode, RunTypeMockOptions} from '../../../src/mocking/mockTypes.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';

const ITERATIONS = 200;

// Minimal RunType node builder — only the fields the walker reads. `id` is
// required by the interface; it's unused by the mock path for these kinds.
let nextId = 0;
function rt(node: Partial<RunType>): RunType {
  return {id: `rt${nextId++}`, ...node} as RunType;
}

function optsWith(dataNode?: MockDataNode): RunTypeMockOptions {
  return {mock: {...defaultMockOptions}, dataNode};
}

function mock(runType: RunType, dataNode?: MockDataNode): unknown {
  return mockRunType(runType, optsWith(dataNode), []);
}

describe('MockData consumption — leaf pools', () => {
  it('string pool: every generated value is drawn from the pool', () => {
    const node = rt({kind: RunTypeKind.string});
    const pool = ['alice', 'bob', 'carol'];
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(node, {pool});
      expect(typeof value).toBe('string');
      expect(pool).toContain(value as string);
    }
  });

  it('boolean pool: drawn from the pool (e.g. always true)', () => {
    const node = rt({kind: RunTypeKind.boolean});
    for (let i = 0; i < ITERATIONS; i++) {
      expect(mock(node, {pool: [true]})).toBe(true);
    }
  });

  it('bigint pool: drawn from the pool', () => {
    const node = rt({kind: RunTypeKind.bigint});
    const pool = [1n, 2n, 3n];
    for (let i = 0; i < ITERATIONS; i++) {
      expect(pool).toContain(mock(node, {pool}) as bigint);
    }
  });

  it('number pool wins over the kind default', () => {
    const node = rt({kind: RunTypeKind.number});
    const pool = [42, 43, 44];
    for (let i = 0; i < ITERATIONS; i++) {
      expect(pool).toContain(mock(node, {pool}) as number);
    }
  });
});

describe('MockData consumption — numeric / Date ranges', () => {
  it('number min/max bound the generated value', () => {
    const node = rt({kind: RunTypeKind.number});
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(node, {min: 10, max: 12}) as number;
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThanOrEqual(12);
    }
  });

  it('Date min/max bound an unbranded Date', () => {
    const node = rt({kind: RunTypeKind.class, subKind: RunTypeSubKind.date});
    const min = new Date('2020-01-01T00:00:00Z');
    const max = new Date('2020-01-31T23:59:59Z');
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(node, {min, max}) as Date;
      expect(value).toBeInstanceOf(Date);
      expect(value.getTime()).toBeGreaterThanOrEqual(min.getTime());
      expect(value.getTime()).toBeLessThanOrEqual(max.getTime());
    }
  });
});

describe('MockData consumption — arrays', () => {
  const arrayNode = rt({kind: RunTypeKind.array, child: rt({kind: RunTypeKind.string})});

  it('rt$length fixes the element count', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(arrayNode, {rt$length: 4}) as unknown[];
      expect(Array.isArray(value)).toBe(true);
      expect(value).toHaveLength(4);
    }
  });

  it('rt$length as [min,max] keeps the count in range', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(arrayNode, {rt$length: [2, 5]}) as unknown[];
      expect(value.length).toBeGreaterThanOrEqual(2);
      expect(value.length).toBeLessThanOrEqual(5);
    }
  });

  it('rt$items pool drives every element', () => {
    const pool = ['x', 'y'];
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(arrayNode, {rt$length: 6, rt$items: {pool}}) as string[];
      expect(value).toHaveLength(6);
      for (const element of value) expect(pool).toContain(element);
    }
  });

  it('rt$items min/max bound numeric elements', () => {
    const numericArray = rt({kind: RunTypeKind.array, child: rt({kind: RunTypeKind.number})});
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(numericArray, {rt$length: 3, rt$items: {min: 100, max: 110}}) as number[];
      expect(value).toHaveLength(3);
      for (const element of value) {
        expect(element).toBeGreaterThanOrEqual(100);
        expect(element).toBeLessThanOrEqual(110);
      }
    }
  });
});

describe('MockData consumption — nested object descent', () => {
  // { name: string; age: number; address: { city: string } }
  const objectNode = rt({
    kind: RunTypeKind.objectLiteral,
    children: [
      rt({kind: RunTypeKind.propertySignature, name: 'name', child: rt({kind: RunTypeKind.string})}),
      rt({kind: RunTypeKind.propertySignature, name: 'age', child: rt({kind: RunTypeKind.number})}),
      rt({
        kind: RunTypeKind.propertySignature,
        name: 'address',
        child: rt({
          kind: RunTypeKind.objectLiteral,
          children: [rt({kind: RunTypeKind.propertySignature, name: 'city', child: rt({kind: RunTypeKind.string})})],
        }),
      }),
    ],
  });

  it('descends by property name to pools / ranges, including nested objects', () => {
    const names = ['Ada', 'Grace'];
    const cities = ['Paris', 'Tokyo'];
    const data: MockDataNode = {
      name: {pool: names},
      age: {min: 18, max: 21},
      address: {city: {pool: cities}},
    };
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(objectNode, data) as {name: string; age: number; address: {city: string}};
      expect(names).toContain(value.name);
      expect(value.age).toBeGreaterThanOrEqual(18);
      expect(value.age).toBeLessThanOrEqual(21);
      expect(cities).toContain(value.address.city);
    }
  });

  it('a property absent from the data node falls through to the kind default', () => {
    // Only `name` is enriched; `age` keeps the global generator (0..10000).
    const data: MockDataNode = {name: {pool: ['only']}};
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock(objectNode, data) as {name: string; age: number};
      expect(value.name).toBe('only');
      expect(typeof value.age).toBe('number');
    }
  });
});

describe('MockData consumption — strictly additive', () => {
  it('no data node ⇒ kinds use their global defaults (sanity)', () => {
    const stringNode = rt({kind: RunTypeKind.string});
    const numberNode = rt({kind: RunTypeKind.number});
    for (let i = 0; i < ITERATIONS; i++) {
      expect(typeof mock(stringNode)).toBe('string');
      const n = mock(numberNode) as number;
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(10000);
    }
  });

  it('object walk with no data is unaffected (all properties present)', () => {
    const objectNode = rt({
      kind: RunTypeKind.objectLiteral,
      children: [
        rt({kind: RunTypeKind.propertySignature, name: 'a', child: rt({kind: RunTypeKind.string})}),
        rt({kind: RunTypeKind.propertySignature, name: 'b', child: rt({kind: RunTypeKind.boolean})}),
      ],
    });
    const value = mock(objectNode) as {a: string; b: boolean};
    expect(typeof value.a).toBe('string');
    expect(typeof value.b).toBe('boolean');
  });
});
