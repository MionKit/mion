import {describe, it, expect} from 'vitest';
import {getRunTypeId, type InjectRunTypeId} from '../../src/index.ts';

describe('ts-runtypes', () => {
  // Static form — caller supplies T, no value.
  it('getRunTypeId (static) throws when called without an id (runtime backstop)', () => {
    // Invoke through a type-erased indirection so the marker scanner
    // doesn't see `InjectRunTypeId<T>` at the call site and the transformer
    // leaves the call alone. Confirms the runtime helper's defensive
    // throw still fires for any path that bypasses the rewrite
    // (dynamic call sites, eval'd code, consumers without the plugin).
    const erased = getRunTypeId as (...args: unknown[]) => unknown;
    expect(() => erased()).toThrow(/no id injected/);
  });

  it('getRunTypeId (static) returns the injected id when the transformer is active', () => {
    // Simulate the transformer: no value, the trailing id literal at slot 1.
    const id = getRunTypeId<{foo: number}>(undefined, 'abc123' as InjectRunTypeId<{foo: number}>);
    expect(id).toBe('abc123');
  });

  // Reflection form — T inferred from a value; the value is ignored at runtime.
  it('getRunTypeId (reflect) throws when called without an id (runtime backstop)', () => {
    const erased = getRunTypeId as (...args: unknown[]) => unknown;
    expect(() => erased({foo: 1})).toThrow(/no id injected/);
  });

  it('getRunTypeId (reflect) returns the injected id when the transformer is active', () => {
    const id = getRunTypeId({foo: 1}, 'abc123' as InjectRunTypeId<{foo: number}>);
    expect(id).toBe('abc123');
  });
});
