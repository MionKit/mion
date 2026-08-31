// Negative ("invalid") mock generation. `createMockDataFn` needs the Vite-plugin
// injected runtype graph, so these tests drive the lower-level
// `mockRunTypeInvalid(runType, options, [])` directly over hand-built RunType
// graphs — the same shape the plugin would feed in. Each assertion checks the
// corrupted value would FAIL validation for the graph (the corrupted position
// holds a value of the wrong type), and that `invalidLeafProbability` steers the
// break to a leaf (1) or the root (0). Many iterations guard against luck.

import {describe, it, expect} from 'vitest';
import {mockRunTypeInvalid} from '../../../src/mocking/mockInvalid.ts';
import {defaultMockOptions} from '../../../src/mocking/constants.mock.ts';
import type {RunTypeMockOptions} from '../../../src/mocking/mockTypes.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind} from '../../../src/go-generated/runTypeKind.generated.ts';

const ITERATIONS = 200;

let nextId = 0;
function rt(node: Partial<RunType>): RunType {
  return {id: `rt${nextId++}`, ...node} as RunType;
}

function invalidMock(runType: RunType, invalidLeafProbability: number, extra?: Partial<typeof defaultMockOptions>): unknown {
  const options: RunTypeMockOptions = {mock: {...defaultMockOptions, ...extra, invalid: true, invalidLeafProbability}};
  return mockRunTypeInvalid(runType, options, []);
}

const objectOf = (children: RunType[]): RunType => rt({kind: RunTypeKind.objectLiteral, children});
const prop = (name: string, child: RunType): RunType => rt({kind: RunTypeKind.propertySignature, name, child});

describe('mockRunTypeInvalid — leaf vs root bias', () => {
  const graph = objectOf([prop('name', rt({kind: RunTypeKind.string})), prop('age', rt({kind: RunTypeKind.number}))]);

  it('invalidLeafProbability=1 corrupts a leaf: root stays an object, one field is wrong-typed', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const value = invalidMock(graph, 1) as {name: unknown; age: unknown};
      expect(typeof value).toBe('object');
      const allValid = typeof value.name === 'string' && typeof value.age === 'number';
      expect(allValid).toBe(false);
    }
  });

  it('invalidLeafProbability=0 replaces the whole root with a wrong type', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      expect(typeof invalidMock(graph, 0)).not.toBe('object');
    }
  });
});

describe('mockRunTypeInvalid — type-aware inverses', () => {
  it('a string leaf becomes a non-string', () => {
    const graph = objectOf([prop('name', rt({kind: RunTypeKind.string}))]);
    for (let i = 0; i < ITERATIONS; i++) {
      const value = invalidMock(graph, 1) as {name: unknown};
      expect(typeof value.name).not.toBe('string');
    }
  });

  it('a number leaf becomes a non-number', () => {
    const graph = objectOf([prop('age', rt({kind: RunTypeKind.number}))]);
    for (let i = 0; i < ITERATIONS; i++) {
      const value = invalidMock(graph, 1) as {age: unknown};
      expect(typeof value.age).not.toBe('number');
    }
  });

  it('a string-literal union gets a value outside the union', () => {
    const union = rt({
      kind: RunTypeKind.union,
      children: [rt({kind: RunTypeKind.literal, literal: 'on'}), rt({kind: RunTypeKind.literal, literal: 'off'})],
    });
    const graph = objectOf([prop('status', union)]);
    for (let i = 0; i < ITERATIONS; i++) {
      const value = invalidMock(graph, 1) as {status: unknown};
      expect(value.status).not.toBe('on');
      expect(value.status).not.toBe('off');
    }
  });

  it('a literal leaf gets a different value', () => {
    const graph = objectOf([prop('kind', rt({kind: RunTypeKind.literal, literal: 'fixed'}))]);
    for (let i = 0; i < ITERATIONS; i++) {
      const value = invalidMock(graph, 1) as {kind: unknown};
      expect(value.kind).not.toBe('fixed');
    }
  });
});

describe('mockRunTypeInvalid — nested + collections', () => {
  it('corrupts a deep leaf while the surrounding structure stays intact', () => {
    const graph = objectOf([prop('user', objectOf([prop('name', rt({kind: RunTypeKind.string}))]))]);
    for (let i = 0; i < ITERATIONS; i++) {
      const value = invalidMock(graph, 1) as {user: {name: unknown}};
      expect(typeof value.user).toBe('object');
      expect(typeof value.user.name).not.toBe('string');
    }
  });

  it('corrupts an array element to the wrong type', () => {
    const graph = objectOf([prop('tags', rt({kind: RunTypeKind.array, child: rt({kind: RunTypeKind.string})}))]);
    for (let i = 0; i < ITERATIONS; i++) {
      const value = invalidMock(graph, 1, {arrayLength: 3}) as {tags: unknown[]};
      expect(Array.isArray(value.tags)).toBe(true);
      expect(value.tags.some((tag) => typeof tag !== 'string')).toBe(true);
    }
  });
});
