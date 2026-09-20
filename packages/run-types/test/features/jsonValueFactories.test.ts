// End-to-end acceptance test for the four value-level JSON factories. They compile the same
// families a marker reaches by fnKey, so the last test in each group asserts the two roads hand
// back the SAME compiled function; without it the factory road could drift unnoticed.
// Per the CLAUDE.md marker-coverage rule both call shapes are exercised, with one paired test
// asserting they resolve the same compiled fn.

import {describe, test, expect} from 'vitest';
import {
  createPrepareForJsonFn,
  createRestoreFromJsonFn,
  createStringifyJsonFn,
  createStripUnknownKeysFn,
  getRTFunction,
  type InjectTypeFnArgs,
} from '@mionjs/run-types';

type Payload = {id: bigint; when: Date; tags: Map<string, number>; name: string};

function payload(): Payload {
  return {
    id: 42n,
    when: new Date('2020-01-02T03:04:05.000Z'),
    tags: new Map([['a', 1]]),
    name: 'ada',
  };
}

// Marker wrappers naming the same fnKeys the factories compile, so each group can compare
// the factory's fn against the one getRTFunction resolves.
function markerClonePrepare<T>(_val?: T, id?: InjectTypeFnArgs<T, 'prepareForJsonClone'>) {
  return getRTFunction<'prepareForJsonClone'>(id);
}
function markerCloneRestore<T>(_val?: T, id?: InjectTypeFnArgs<T, 'restoreFromJsonClone'>) {
  return getRTFunction<'restoreFromJsonClone'>(id);
}
function markerStringify<T>(_val?: T, id?: InjectTypeFnArgs<T, 'stringifyJson'>) {
  return getRTFunction<'stringifyJson'>(id);
}
function markerStripWire<T>(_val?: T, id?: InjectTypeFnArgs<T, 'stripUnknownKeysWire'>) {
  return getRTFunction<'stripUnknownKeysWire'>(id);
}

describe('createPrepareForJsonFn + createRestoreFromJsonFn — the clone pair round-trips', () => {
  test('a bigint, a Date and a Map survive prepare then restore', () => {
    const prepare = createPrepareForJsonFn<Payload>();
    const restore = createRestoreFromJsonFn<Payload>();

    const value = payload();
    const restored = restore(JSON.parse(JSON.stringify(prepare(value))));

    expect(restored).toEqual(value);
    expect(restored.id).toBe(42n);
    expect(restored.when).toBeInstanceOf(Date);
    expect(restored.tags).toBeInstanceOf(Map);
    expect(restored.tags.get('a')).toBe(1);
  });

  test('clone drops an undeclared property, mutate keeps it, on BOTH sides', () => {
    type Declared = {a: string};
    const withExtra = () => ({a: 'x', extra: 1}) as Declared;

    const clonePrepare = createPrepareForJsonFn<Declared>();
    const mutatePrepare = createPrepareForJsonFn<Declared>(undefined, {strategy: 'mutate'});
    expect(clonePrepare(withExtra())).toEqual({a: 'x'});
    expect(mutatePrepare(withExtra())).toEqual({a: 'x', extra: 1});

    const cloneRestore = createRestoreFromJsonFn<Declared>();
    const mutateRestore = createRestoreFromJsonFn<Declared>(undefined, {strategy: 'mutate'});
    expect(cloneRestore({a: 'x', extra: 1})).toEqual({a: 'x'});
    expect(mutateRestore({a: 'x', extra: 1})).toEqual({a: 'x', extra: 1});
  });

  test('the compact pair round-trips through a positional array', () => {
    type Point = {x: number; y: number};
    const prepare = createPrepareForJsonFn<Point>(undefined, {strategy: 'compact'});
    const restore = createRestoreFromJsonFn<Point>(undefined, {strategy: 'compact'});

    const wire = prepare({x: 1, y: 2});
    // The point of compact: property names never reach the wire.
    expect(Array.isArray(wire)).toBe(true);
    expect(JSON.stringify(wire)).not.toContain('"x"');
    expect(restore(wire)).toEqual({x: 1, y: 2});
  });

  test('each factory hands back the same compiled fn the marker road resolves', () => {
    expect(createPrepareForJsonFn<Payload>()).toBe(markerClonePrepare<Payload>());
    expect(createRestoreFromJsonFn<Payload>()).toBe(markerCloneRestore<Payload>());
  });

  test('both marker call shapes resolve the same compiled fn', () => {
    const value = payload();
    const fromStatic = createPrepareForJsonFn<Payload>();
    const fromValue = createPrepareForJsonFn(value);
    expect(fromStatic).toBe(fromValue);
  });
});

describe('createStringifyJsonFn — one pass to a JSON string', () => {
  test('its string parses back to what the clone prepare produced', () => {
    const stringify = createStringifyJsonFn<Payload>();
    const prepare = createPrepareForJsonFn<Payload>();

    const value = payload();
    expect(JSON.parse(stringify(value)!)).toEqual(JSON.parse(JSON.stringify(prepare(payload()))));
  });

  test('undeclared properties never reach the string', () => {
    type Declared = {a: string};
    const stringify = createStringifyJsonFn<Declared>();
    expect(stringify({a: 'x', extra: 1} as Declared)).toBe('{"a":"x"}');
  });

  test('it hands back the same compiled fn the marker road resolves', () => {
    expect(createStringifyJsonFn<Payload>()).toBe(markerStringify<Payload>());
  });

  test('both marker call shapes resolve the same compiled fn', () => {
    expect(createStringifyJsonFn<Payload>()).toBe(createStringifyJsonFn(payload()));
  });
});

describe('createStripUnknownKeysFn — blanks rather than rebuilds', () => {
  test('an undeclared property is set to undefined, not removed', () => {
    type Declared = {a: string};
    const strip = createStripUnknownKeysFn<Declared>();

    const blanked = strip({a: 'x', extra: 1}) as Record<string, unknown>;
    expect(blanked.a).toBe('x');
    expect(blanked.extra).toBeUndefined();
    // The distinction from createCloneExactShapeFn: the key survives, its value does not.
    expect(Object.keys(blanked)).toContain('extra');
  });

  test('it hands back the same compiled fn the marker road resolves', () => {
    expect(createStripUnknownKeysFn<Payload>()).toBe(markerStripWire<Payload>());
  });

  test('both marker call shapes resolve the same compiled fn', () => {
    expect(createStripUnknownKeysFn<Payload>()).toBe(createStripUnknownKeysFn(payload()));
  });
});
