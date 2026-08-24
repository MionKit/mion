// Regressions for codec bugs the all-strategy round-trip fuzzer found
// (packages/ts-runtypes/test/fuzz/roundtrip/). Each pins a fix that the
// fuzzer surfaced on a valid-but-strange generated type.

import {describe, test, expect} from 'vitest';
import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';

describe('fuzzer regressions — index signatures & union dispatch', () => {
  // A `Record<K, V>` validator used to accept a Map / Set / Date: a for-in over
  // those enumerates no own string keys, so the per-key value check passed
  // vacuously and the bare `typeof === 'object'` let them through. In a union
  // that over-acceptance mis-dispatched a Map onto the Record member, which then
  // serialized it as `{}`. The validator now brand-checks index-sig objects.
  test('Record validator rejects non-plain objects, accepts plain objects', () => {
    const isRecord = createValidateFn<Record<string, number>>();
    expect(isRecord({a: 1, b: 2})).toBe(true);
    expect(isRecord({})).toBe(true);
    expect(isRecord(new Map([['a', 1]]))).toBe(false);
    expect(isRecord(new Set([1]))).toBe(false);
    expect(isRecord(new Date())).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });

  // The Map-vs-Record mis-dispatch above corrupted a discriminated union: a Map
  // value matched the Record candidate and was encoded as `{}` on every lane.
  test('union with Map + Record members round-trips a Map value without collapsing to {}', () => {
    type U = {kind: 'm'; v: Map<string, number>} | {kind: 'r'; v: Record<string, number>};
    const encode = createJsonEncoderFn<U>();
    const decode = createJsonDecoderFn<U>();
    const value: U = {
      kind: 'm',
      v: new Map([
        ['x', 1],
        ['y', 2],
      ]),
    };
    const out = decode(encode(value) as string) as {kind: 'm'; v: Map<string, number>};
    expect(out.kind).toBe('m');
    expect(out.v instanceof Map).toBe(true);
    expect([...out.v.entries()].sort()).toEqual([
      ['x', 1],
      ['y', 2],
    ]);
  });

  // The single-pass `direct` strategy built an all-optional object's wire with a
  // skip-commas flag set once before the prop loop; a nested-object value child
  // cleared that shared flag, so a later sibling baked in a trailing comma and
  // produced invalid JSON. The flag is now re-established per property.
  test('direct strategy emits valid JSON for an all-optional object with a nested object + index signature', () => {
    type Shape = {a?: {inner: number}; b?: string; [k: string]: unknown};
    const encode = createJsonEncoderFn<Shape>(undefined, {strategy: 'direct'});
    const value: Shape = {a: {inner: 1}, b: 'x'};
    const wire = encode(value) as string;
    expect(() => JSON.parse(wire)).not.toThrow();
    expect(JSON.parse(wire)).toMatchObject({a: {inner: 1}, b: 'x'});
  });

  // The strip decoder's index-signature for-in sweep used to run on the NAMED
  // sibling props too. For a named prop whose decoded value is a string (a
  // RegExp on the wire), `for…in` over that string enumerated its character
  // indices, which both corrupted the prop and (on a long value) overflowed the
  // unknown-keys cap with "Too many unknown keys". The sweep now skips siblings.
  test('strip decoder round-trips an object mixing a named RegExp prop with an index signature', () => {
    type T = {pattern: RegExp; [k: number]: {a: number}};
    const encode = createJsonEncoderFn<T>();
    const decode = createJsonDecoderFn<T>();
    const value: T = {pattern: /a-very-long-regex-source-[0-9]+/g, 0: {a: 1}, 1: {a: 2}};
    const out = decode(encode(value) as string) as T;
    expect(out.pattern instanceof RegExp).toBe(true);
    expect(out.pattern.source).toBe('a-very-long-regex-source-[0-9]+');
    expect(out[0]).toEqual({a: 1});
    expect(out[1]).toEqual({a: 2});
  });

  // A `[k: string | number | symbol]: U` key is split into one index signature
  // per kind. Each used to emit its own `for…in` sweep, so the JSON codec
  // processed every dynamic key twice — double-wrapping a union value on encode
  // and reading an already-decoded value on decode ("invalid union index"). The
  // codec now emits one sweep per distinct index value type.
  test('union value under a multi-kind index signature round-trips through every JSON strategy', () => {
    type T = {[k: string]: bigint | number | string};
    const value: T = {a: 5n, b: 3, c: 'x', 0: 7n, 1: 'y'};
    for (const strategy of ['clone', 'mutate', 'direct', 'compact'] as const) {
      const decStrategy = strategy === 'compact' ? 'compact' : strategy === 'mutate' ? 'preserve' : 'strip';
      const encode = createJsonEncoderFn<T>(undefined, {strategy});
      const decode = createJsonDecoderFn<T>(undefined, {strategy: decStrategy});
      const out = decode(encode(structuredClone(value)) as string) as T;
      expect(out, `strategy ${strategy}`).toEqual(value);
    }
  });

  // A discriminated union whose object members share a merged property with
  // structurally-overlapping candidate shapes used to produce a non-byte-stable
  // JSON wire. Here member `t3`'s `f0` is `Record<string, undefined>`: a value
  // `{k0: undefined}` serializes to `{}` because JSON drops undefined entries.
  // The merged-prop sub-dispatch re-classified each prop value independently
  // (first-match validate over the candidate list), so the original `{k0:
  // undefined}` matched the Record candidate while the round-tripped `{}` matched
  // an EARLIER all-optional object candidate (`{p0?: Set<…>}`, whose loose-check
  // accepts the empty object) — a different sub-index, so
  // encode(decode(encode(v))) !== encode(v) on clone / mutate / direct / compact.
  // The data was always correct (both wires decode to `{}`); only the wire drifted.
  // Binary stayed stable (its Record codec keeps undefined keys, so the value
  // never changes shape). The encoders now select each candidate by the union
  // discriminant (`kind`), which survives the round-trip, so the sub-index — and
  // the whole wire — is byte-stable. Lower priority than data bugs: wire only.
  test('discriminated union with overlapping merged-prop shapes keeps a byte-stable JSON wire', () => {
    type DiscOverlap = {kind: 't0'; f0: {p0?: Set<number>}} | {kind: 't3'; f0?: Record<string, undefined>};

    const validate = createValidateFn<DiscOverlap>();
    // f0 carries a key with an undefined value — a valid Record<string, undefined>
    // that JSON renders as `{}` (the lossy projection that drove the instability).
    const value: DiscOverlap = {kind: 't3', f0: {k0: undefined}};
    expect(validate(value)).toBe(true);

    const cloneEnc = createJsonEncoderFn<DiscOverlap>(undefined, {strategy: 'clone'});
    const mutateEnc = createJsonEncoderFn<DiscOverlap>(undefined, {strategy: 'mutate'});
    const directEnc = createJsonEncoderFn<DiscOverlap>(undefined, {strategy: 'direct'});
    const compactEnc = createJsonEncoderFn<DiscOverlap>(undefined, {strategy: 'compact'});
    const stripDec = createJsonDecoderFn<DiscOverlap>(undefined, {strategy: 'strip'});
    const preserveDec = createJsonDecoderFn<DiscOverlap>(undefined, {strategy: 'preserve'});
    const compactDec = createJsonDecoderFn<DiscOverlap>(undefined, {strategy: 'compact'});

    const lanes = [
      {label: 'clone', encode: cloneEnc, decode: stripDec},
      {label: 'mutate', encode: mutateEnc, decode: preserveDec},
      {label: 'direct', encode: directEnc, decode: stripDec},
      {label: 'compact', encode: compactEnc, decode: compactDec},
    ];

    for (const {label, encode, decode} of lanes) {
      const wire1 = encode(structuredClone(value)) as string;
      const decoded = decode(wire1);
      expect(validate(decoded), `${label}: round-trip validates`).toBe(true);
      const wire2 = encode(structuredClone(decoded)) as string;
      // Wire stability: re-encoding the decoded value reproduces the same wire.
      expect(wire2, `${label}: wire is byte-stable under re-encode`).toEqual(wire1);
    }
  });
});
