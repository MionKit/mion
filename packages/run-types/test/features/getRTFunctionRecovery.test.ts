// End-to-end acceptance test for `getRTFunction` — the generic resolver that
// recovers the compiled fn for `T` from an injected `InjectTypeFnArgs<T, Fn>`
// tuple. This is the surface a framework wrapper (mion) uses to pull a
// per-strategy JSON prepare / restore for a route's params / response type
// WITHOUT a dedicated createX factory: name the primitive's fnKey in the marker,
// forward the injected slot to `getRTFunction`, get the callable fn back.
//
// The JSON value-level primitives have no `createX`, so this test is where their
// public recoverability is pinned: `'pjs'` (clone prepare), `'rj'` (restore),
// `'cj'` / `'cjr'` (compact encode / decode), `'sj'` (direct stringify) and
// `'ukuw'` (strip wire pre-pass). Per the CLAUDE.md marker-coverage rule both
// call shapes are exercised — the static `recoverX<T>()` form and the
// value-first `recoverX(value)` reflection form — with one paired test asserting
// the two forms resolve the SAME compiled fn (the runtime analog of the Go-side
// TestAtomic_FormEquivalence hash check).

import {describe, test, expect} from 'vitest';
import {getRTFunction, type InjectTypeFnArgs} from '@mionjs/run-types';

// Test-only wrappers: declare the primitive's fnKey in a trailing
// InjectTypeFnArgs marker and resolve the injected tuple through getRTFunction,
// keyed by the SAME fnKey — exactly the wrapper shape a framework declares.
// `_val` exists only so the reflection call shape `recoverX(value)` can infer
// `T` from the value; it is never read at runtime.
function recoverClonePrepare<T>(_val?: T, id?: InjectTypeFnArgs<T, 'prepareForJsonClone'>) {
  return getRTFunction<'prepareForJsonClone'>(id);
}
function recoverMutatePrepare<T>(_val?: T, id?: InjectTypeFnArgs<T, 'prepareForJsonMutate'>) {
  return getRTFunction<'prepareForJsonMutate'>(id);
}
function recoverRestore<T>(_val?: T, id?: InjectTypeFnArgs<T, 'restoreFromJson'>) {
  return getRTFunction<'restoreFromJson'>(id);
}
function recoverCompactEncode<T>(_val?: T, id?: InjectTypeFnArgs<T, 'compactForJson'>) {
  return getRTFunction<'compactForJson'>(id);
}
function recoverCompactDecode<T>(_val?: T, id?: InjectTypeFnArgs<T, 'compactFromJson'>) {
  return getRTFunction<'compactFromJson'>(id);
}
function recoverDirectStringify<T>(_val?: T, id?: InjectTypeFnArgs<T, 'stringifyJson'>) {
  return getRTFunction<'stringifyJson'>(id);
}
function recoverStripWire<T>(_val?: T, id?: InjectTypeFnArgs<T, 'stripUnknownKeysWire'>) {
  return getRTFunction<'stripUnknownKeysWire'>(id);
}
function recoverStripRestore<T>(_val?: T, id?: InjectTypeFnArgs<T, 'restoreFromJsonStrip'>) {
  return getRTFunction<'restoreFromJsonStrip'>(id);
}

type Payload = {id: bigint; when: Date; name: string};

describe('getRTFunction — recover JSON value-level primitives via an InjectTypeFnArgs marker', () => {
  test('static form recovers clone prepare (pjs) + restore (rj) for a bigint + Date payload', () => {
    const prepare = recoverClonePrepare<Payload>();
    const restore = recoverRestore<Payload>();

    const value: Payload = {id: 42n, when: new Date('2020-01-02T03:04:05.000Z'), name: 'ada'};
    // prepare produces a JSON-safe value (bigint -> string; Date kept, then
    // serialized by JSON.stringify via toJSON); restore maps it back.
    const wire = JSON.stringify(prepare(value));
    const restored = restore(JSON.parse(wire)) as Payload;

    expect(restored.id).toBe(42n);
    expect(restored.when instanceof Date).toBe(true);
    expect(restored.when.getTime()).toBe(value.when.getTime());
    expect(restored.name).toBe('ada');
  });

  test('reflection form (T inferred from a value) resolves the same clone prepare + restore', () => {
    const seed: Payload = {id: 7n, when: new Date('2021-05-06T07:08:09.000Z'), name: 'bob'};
    const prepare = recoverClonePrepare(seed);
    const restore = recoverRestore(seed);

    const value: Payload = {id: 7n, when: new Date('2021-05-06T07:08:09.000Z'), name: 'bob'};
    const restored = restore(JSON.parse(JSON.stringify(prepare(value)))) as Payload;
    expect(restored.id).toBe(7n);
    expect(restored.when.getTime()).toBe(value.when.getTime());
    expect(restored.name).toBe('bob');
  });

  test('both call shapes resolve to the SAME compiled fn (one cache entry per T + family)', () => {
    const seed: Payload = {id: 5n, when: new Date('2025-05-05T05:05:05.000Z'), name: 'eve'};
    // Static and reflection forms map to the same <pjsHash>_<PayloadId> key, so
    // getRTFunction returns the identical rtUtils entry.fn reference.
    const fromStatic = recoverClonePrepare<Payload>();
    const fromValue = recoverClonePrepare(seed);
    expect(fromStatic).toBe(fromValue);
  });

  test('clone prepare (pjs) drops undeclared keys by construction', () => {
    const prepare = recoverClonePrepare<Payload>();
    const value = {id: 1n, when: new Date('2022-01-01T00:00:00.000Z'), name: 'x', extra: 'nope'} as Payload & {
      extra: string;
    };
    const safe = prepare(value) as Record<string, unknown>;
    expect('extra' in safe).toBe(false);
    expect(safe.name).toBe('x');
  });

  test('mutate prepare (pj) round-trips with restore and preserves undeclared keys', () => {
    const prepare = recoverMutatePrepare<Payload>();
    const restore = recoverRestore<Payload>();

    const value = {id: 4n, when: new Date('2028-08-08T08:08:08.000Z'), name: 'ivy', extra: 'kept'} as Payload & {
      extra: string;
    };
    const prepared = prepare(value) as Record<string, unknown>;
    // mutate preserves undeclared keys on the wire (unlike the clone prepare).
    expect(prepared.extra).toBe('kept');
    const restored = restore(JSON.parse(JSON.stringify(prepared))) as Payload;
    expect(restored.id).toBe(4n);
    expect(restored.when.getTime()).toBe(value.when.getTime());
    expect(restored.name).toBe('ivy');
  });

  test('a root undefined / void is safe — prepare passes through, restore returns undefined', () => {
    const prepareVoid = recoverClonePrepare<undefined>();
    const restoreVoid = recoverRestore<undefined>();

    // The value-level primitives never throw on a root undefined; the caller owns
    // the envelope, so undefined inside their own array stringifies to null and
    // restore maps any input back to undefined.
    expect(prepareVoid(undefined)).toBeUndefined();
    const wire = JSON.stringify([prepareVoid(undefined)]);
    expect(wire).toBe('[null]');
    expect(restoreVoid((JSON.parse(wire) as unknown[])[0])).toBeUndefined();
  });

  test('compact encode (cj) + decode (cjr) round-trip the positional wire, static form', () => {
    const encode = recoverCompactEncode<Payload>();
    const decode = recoverCompactDecode<Payload>();

    const value: Payload = {id: 9n, when: new Date('2023-03-03T03:03:03.000Z'), name: 'cee'};
    const restored = decode(JSON.parse(JSON.stringify(encode(value)))) as Payload;
    expect(restored.id).toBe(9n);
    expect(restored.when.getTime()).toBe(value.when.getTime());
    expect(restored.name).toBe('cee');
  });

  test('compact round-trip resolves through the reflection form too', () => {
    const seed: Payload = {id: 2n, when: new Date('2024-04-04T04:04:04.000Z'), name: 'dee'};
    const encode = recoverCompactEncode(seed);
    const decode = recoverCompactDecode(seed);
    const restored = decode(JSON.parse(JSON.stringify(encode(seed)))) as Payload;
    expect(restored.id).toBe(2n);
    expect(restored.name).toBe('dee');
  });

  test('direct stringify (sj) recovers a value -> JSON string function', () => {
    const stringify = recoverDirectStringify<Payload>();
    const value: Payload = {id: 8n, when: new Date('2026-06-06T06:06:06.000Z'), name: 'fay'};
    const wire = stringify(value);
    expect(typeof wire).toBe('string');
    const parsed = JSON.parse(wire as string) as {id: string; name: string};
    // bigint rides the wire as a JSON string; the name is verbatim.
    expect(parsed.id).toBe('8');
    expect(parsed.name).toBe('fay');
  });

  test('static form recovers the strip restore (rjs), which drops undeclared keys', () => {
    const prepare = recoverClonePrepare<Payload>();
    const restore = recoverStripRestore<Payload>();

    const value: Payload = {id: 42n, when: new Date('2020-01-02T03:04:05.000Z'), name: 'ada'};
    // An undeclared key put on the WIRE, the way a caller that is not mion can:
    // the clone encoder would never write it, so it has to be the decoder that drops it.
    const wire = {...(JSON.parse(JSON.stringify(prepare(value))) as object), extra: 'nope'};
    const restored = restore(wire) as Payload & {extra?: string};

    expect(restored.id).toBe(42n);
    expect(restored.when instanceof Date).toBe(true);
    expect(restored.name).toBe('ada');
    // Gone, not blanked: the key must not survive a spread into a database insert.
    expect('extra' in restored).toBe(false);
    expect(Object.keys(restored).sort()).toEqual(['id', 'name', 'when']);
  });

  test('reflection form (T inferred from a value) resolves the same strip restore', () => {
    const seed: Payload = {id: 7n, when: new Date('2021-05-06T07:08:09.000Z'), name: 'bob'};
    const prepare = recoverClonePrepare(seed);
    const restore = recoverStripRestore(seed);

    const wire = {...(JSON.parse(JSON.stringify(prepare(seed))) as object), extra: 'nope'};
    const restored = restore(wire) as Payload & {extra?: string};
    expect(restored.id).toBe(7n);
    expect(restored.when.getTime()).toBe(seed.when.getTime());
    expect('extra' in restored).toBe(false);
  });

  test('both call shapes of the strip restore resolve to the SAME compiled fn', () => {
    const seed: Payload = {id: 5n, when: new Date('2025-05-05T05:05:05.000Z'), name: 'eve'};
    const fromStatic = recoverStripRestore<Payload>();
    const fromValue = recoverStripRestore(seed);
    expect(fromStatic).toBe(fromValue);
  });

  test('the strip restore leaves a declared key alone even when its value needs no transform', () => {
    // The rebuild copies every declared slot, transform or not; a slot left out of
    // the copy would be a declared key DELETED, which is the opposite of the point.
    const restore = recoverStripRestore<Payload>();
    const restored = restore({id: '9', when: '2020-01-02T03:04:05.000Z', name: 'zoe', extra: 1}) as Payload;
    expect(restored.name).toBe('zoe');
    expect(restored.id).toBe(9n);
    expect(Object.keys(restored).sort()).toEqual(['id', 'name', 'when']);
  });

  test('the strip wire pre-pass (ukuw) is recoverable via the marker', () => {
    // ukuw is an internal decoder helper with subtle wire semantics; the point
    // here is only that "all functions" are reachable through getRTFunction, so
    // assert it resolves to a callable fn (static + reflection forms alike).
    const strip = recoverStripWire<Payload>();
    const seed: Payload = {id: 3n, when: new Date('2027-07-07T07:07:07.000Z'), name: 'gil'};
    const stripReflected = recoverStripWire(seed);
    expect(typeof strip).toBe('function');
    expect(typeof stripReflected).toBe('function');
  });
});
