// Explicit FE coverage for the DataOnly union-member drop contract: a union
// member that DataOnly strips (symbol / function / Promise / non-serializable /
// never) is DROPPED, so the union validates and serializes as its data members
// (was: whole-union alwaysThrow). An all-stripped union (DataOnly = never) and
// other collapse-to-never/empty positions still throw. Drives the full
// vite-plugin pipeline, complementing the Go emitter tests in
// internal/cachegen/typefunctions/union_dataonly_test.go.
//
// The collapse cases below also guard against a fixed facts-cache poisoning bug
// (isJsonCompatible on an unresolved Map/Set inner ref) that corrupted unrelated
// merged-prop unions in the same scan — see json_compat.go's isJsonCompatible.

import {describe, test, expect} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
} from '@ts-runtypes/core';

// A NAMED all-stripped union — externalized as its own cache entry (the name
// rule), so it is reached through the walker's dispatch gate rather than being
// inlined into its parent. Both members DataOnly-strip (non-serializable
// natives), so the union projects to `never`. See the gate-elision regression
// test at the bottom of the collapse suite.
type NativeUnion = ArrayBuffer | SharedArrayBuffer;
interface HasNativeUnion {
  x: NativeUnion;
  y: number;
}

describe('DataOnly union-member drop', () => {
  test('Date | symbol — symbol arm dropped, validates as Date', () => {
    const isit = createValidateFn<Date | symbol>();
    expect(isit(new Date())).toBe(true);
    expect(isit(Symbol('x'))).toBe(false);
    expect(isit(123)).toBe(false);
  });

  test('Date | symbol — JSON + binary round-trip the surviving Date', () => {
    const d = new Date('2020-01-01T00:00:00.000Z');
    expect(createJsonDecoderFn<Date | symbol>()(createJsonEncoderFn<Date | symbol>()(d) as string)).toEqual(d);
    expect(createBinaryDecoderFn<Date | symbol>()(createBinaryEncoderFn<Date | symbol>()(d))).toEqual(d);
  });

  test('string | bigint | symbol — drops symbol, keeps string | bigint', () => {
    const isit = createValidateFn<string | bigint | symbol>();
    expect(isit('hello')).toBe(true);
    expect(isit(5n)).toBe(true);
    expect(isit(Symbol('x'))).toBe(false);
    const enc = createJsonEncoderFn<string | bigint | symbol>();
    const dec = createJsonDecoderFn<string | bigint | symbol>();
    expect(dec(enc('hello') as string)).toEqual('hello');
    expect(dec(enc(5n) as string)).toEqual(5n);
  });

  test('getValidationErrors reports the surviving-union shape, not a throw', () => {
    const errs = createGetValidationErrorsFn<Date | symbol>();
    expect(errs(new Date())).toEqual([]);
    expect(errs(Symbol('x')).length).toBeGreaterThan(0);
  });

  test('(Date | symbol)[] — element union drops symbol, round-trips Date[]', () => {
    const arr = [new Date('2020-01-01T00:00:00.000Z'), new Date('2021-06-15T12:00:00.000Z')];
    const enc = createJsonEncoderFn<(Date | symbol)[]>();
    const dec = createJsonDecoderFn<(Date | symbol)[]>();
    expect(dec(enc(arr) as string)).toEqual(arr);
  });
});

describe('DataOnly collapse-to-never / empty still throws', () => {
  test('all members of a union stripped (DataOnly = never)', () => {
    expect(() => createValidateFn<symbol | (() => void)>()).toThrow();
    expect(() => createJsonEncoderFn<symbol | (() => void)>()).toThrow();
  });

  test('array / tuple / Map / Set whose element collapses to never', () => {
    expect(() => createJsonEncoderFn<symbol[]>()).toThrow();
    expect(() => createJsonEncoderFn<[string, symbol]>()).toThrow();
    expect(() => createJsonEncoderFn<Map<string, symbol>>()).toThrow();
    expect(() => createJsonEncoderFn<Set<symbol>>()).toThrow();
  });

  // Regression: an all-stripped union at a NESTED, EXTERNALIZED position.
  // The union's noop predicate (unionJsonNoop) once reported the all-stripped
  // union as identity, so the walker's dispatch gate elided the `x` transform;
  // with no live primitive left, the whole encoder collapsed to the JSON
  // composite noop short-form and the runtime substituted native
  // JSON.stringify — silently emitting `{"x":{},"y":1}` instead of throwing.
  // Every strategy must reach the union's alwaysThrow (never round-trip a
  // non-serializable native as `{}`). Root-position collapse is covered above;
  // this pins the nested + externalized (named-union) path the gate walks.
  test('all-stripped union at a nested externalized property still throws (gate-elision regression)', () => {
    const buf = new ArrayBuffer(4);
    expect(() => {
      const encode = createJsonEncoderFn<HasNativeUnion>(undefined, {strategy: 'mutate'});
      return encode({x: buf, y: 1} as HasNativeUnion);
    }).toThrow();
    expect(() => {
      const encode = createJsonEncoderFn<HasNativeUnion>(); // clone (default)
      return encode({x: buf, y: 1} as HasNativeUnion);
    }).toThrow();
    expect(() => {
      const encode = createJsonEncoderFn<HasNativeUnion>(undefined, {strategy: 'direct'});
      return encode({x: buf, y: 1} as HasNativeUnion);
    }).toThrow();
    expect(() => {
      const encode = createBinaryEncoderFn<HasNativeUnion>();
      return encode({x: buf, y: 1} as HasNativeUnion);
    }).toThrow();
  });
});
