// Regressions for codec bugs the all-strategy round-trip fuzzer found
// (packages/run-types/test/fuzz/roundtrip/). Each pins a fix that the
// fuzzer surfaced on a valid-but-strange generated type.

import {describe, test, expect} from 'vitest';
import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';

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

  // The index-signature sweep must skip named siblings: `for…in` over a Date's wire string walks its characters.
  test('the default decoder round-trips an object mixing a named Date prop with an index signature', () => {
    type T = {placed: Date; [k: number]: {a: number}};
    const encode = createJsonEncoderFn<T>();
    const decode = createJsonDecoderFn<T>();
    const value: T = {placed: new Date('2026-02-03T04:05:06.789Z'), 0: {a: 1}, 1: {a: 2}};
    const out = decode(encode(value) as string) as T;
    expect(out.placed instanceof Date).toBe(true);
    expect(out.placed.toISOString()).toBe('2026-02-03T04:05:06.789Z');
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
    // Every strategy is spelled at its own call site: the build reads it as a literal, so a variable
    // resolves to no strategy and the call falls back instead of compiling the one named.
    const pairs = [
      ['clone', createJsonEncoderFn<T>(undefined, {strategy: 'clone'}), createJsonDecoderFn<T>(undefined, {strategy: 'clone'})],
      [
        'mutate',
        createJsonEncoderFn<T>(undefined, {strategy: 'mutate'}),
        createJsonDecoderFn<T>(undefined, {strategy: 'mutate'}),
      ],
      [
        'compact',
        createJsonEncoderFn<T>(undefined, {strategy: 'compact'}),
        createJsonDecoderFn<T>(undefined, {strategy: 'compact'}),
      ],
    ] as const;
    for (const [name, encode, decode] of pairs) {
      const out = decode(encode(structuredClone(value)) as string) as T;
      expect(out, `strategy ${name}`).toEqual(value);
    }
  });

  // `{k0: undefined}` encodes as `{}`, which first-match dispatch re-classifies as the earlier `{p0?: Set<…>}` member.
  // The encoders pick the candidate by the `kind` discriminant instead, so the JSON wire stays byte-stable.
  test('discriminated union with overlapping merged-prop shapes keeps a byte-stable JSON wire', () => {
    type DiscOverlap = {kind: 't0'; f0: {p0?: Set<number>}} | {kind: 't3'; f0?: Record<string, undefined>};

    const validate = createValidateFn<DiscOverlap>();
    // f0 carries a key with an undefined value — a valid Record<string, undefined>
    // that JSON renders as `{}` (the lossy projection that drove the instability).
    const value: DiscOverlap = {kind: 't3', f0: {k0: undefined}};
    expect(validate(value)).toBe(true);

    const cloneEnc = createJsonEncoderFn<DiscOverlap>(undefined, {strategy: 'clone'});
    const mutateEnc = createJsonEncoderFn<DiscOverlap>(undefined, {strategy: 'mutate'});
    const compactEnc = createJsonEncoderFn<DiscOverlap>(undefined, {strategy: 'compact'});
    const cloneDec = createJsonDecoderFn<DiscOverlap>(undefined, {strategy: 'clone'});
    const mutateDec = createJsonDecoderFn<DiscOverlap>(undefined, {strategy: 'mutate'});
    const compactDec = createJsonDecoderFn<DiscOverlap>(undefined, {strategy: 'compact'});

    const lanes = [
      {label: 'clone', encode: cloneEnc, decode: cloneDec},
      {label: 'mutate', encode: mutateEnc, decode: mutateDec},
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
