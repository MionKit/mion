// Per-kind smoke tests + stringifyJson-vs-prepareForJson divergence
// assertions for `createStringifyJson`. Drives the full vite-plugin
// pipeline (transform → precompiled factory → runtime dispatch).
//
// Goal: catch per-kind emit bugs against expected raw output strings
// where the output is canonical, AND catch divergences from
// prepareForJson + JSON.stringify that the user wants documented:
//
//   1. No-mutation invariant — stringifyJson reads but doesn't write.
//      prepareForJson mutates `v` in place. Load-bearing assertion:
//      bigint in input remains a bigint after a stringifyJson call.
//   2. Extras stripped in the EMIT — bigint extras don't reach
//      JSON.stringify, so no throw. prepareForJson + JSON.stringify
//      would throw.
//   3. Per-kind raw output — atomic types where the encoding is
//      canonical (bigint → `"123"`, Date → `"<iso>"`, etc.) get
//      byte-level checks.

import {describe, test, expect} from 'vitest';
import {createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';

describe('createStringifyJson — atomic raw output', () => {
  test('string', () => {
    const sjs = createJsonEncoderFn<string>();
    expect(sjs('hello')).toBe('"hello"');
    expect(sjs('')).toBe('""');
    expect(sjs('with "quotes"')).toBe('"with \\"quotes\\""');
  });

  test('number — root returns a String() wrapper', () => {
    const sjs = createJsonEncoderFn<number>();
    expect(sjs(42)).toBe('42');
    expect(sjs(-1.5)).toBe('-1.5');
    expect(sjs(0)).toBe('0');
  });

  test('boolean', () => {
    const sjs = createJsonEncoderFn<boolean>();
    expect(sjs(true)).toBe('true');
    expect(sjs(false)).toBe('false');
  });

  test('null', () => {
    const sjs = createJsonEncoderFn<null>();
    expect(sjs(null)).toBe('null');
  });

  test('undefined — top-level wraps into a JSON document and round-trips', () => {
    const enc = createJsonEncoderFn<undefined>();
    const dec = createJsonDecoderFn<undefined>();
    // Top-level undefined has no native JSON form. Rather than return the JS
    // value undefined (which JSON.parse can't read back), the encoder wraps it
    // in a one-element array document so it round-trips; the decoder restores
    // undefined. See DataOnly<undefined> = undefined.
    expect(enc(undefined)).toBe('[null]');
    expect(dec(enc(undefined) as string)).toBeUndefined();
  });

  test('void — top-level wraps into a JSON document and round-trips', () => {
    const enc = createJsonEncoderFn<void>();
    const dec = createJsonDecoderFn<void>();
    // Same wrap as undefined — both KindUndefined and KindVoid are kept by
    // DataOnly but have no top-level JSON form.
    expect(enc(undefined)).toBe('[null]');
    expect(dec(enc(undefined) as string)).toBeUndefined();
  });

  test('bigint — quoted decimal string', () => {
    const sjs = createJsonEncoderFn<bigint>();
    expect(sjs(123n)).toBe('"123"');
    expect(sjs(0n)).toBe('"0"');
    expect(sjs(-42n)).toBe('"-42"');
  });

  test('Date — quoted ISO string via toJSON', () => {
    const sjs = createJsonEncoderFn<Date>();
    const d = new Date('2000-08-06T02:13:00.000Z');
    expect(sjs(d)).toBe('"2000-08-06T02:13:00.000Z"');
  });

  // ============================================================================
  // Numeric-enum: emit the bare value (`v`) at the JS literal slot
  // rather than `JSON.stringify(v)`, because a JS number is already a
  // valid JSON literal at any position. Mirrors the reference
  // rtCompilers/json/stringifyJson.ts:51-53 — the protocol's `IndexT`
  // field carries the enum's underlying kind, and our emit branches on
  // `KindNumber` to elide the wrap. String enums keep the JSON.stringify
  // call so the output is properly quoted.
  // ============================================================================

  test('numeric enum — bare value at root + array', () => {
    enum N {
      A,
      B,
      C,
    }
    const sjs = createJsonEncoderFn<N>();
    expect(sjs(N.A)).toBe('0');
    expect(sjs(N.B)).toBe('1');
    expect(sjs(N.C)).toBe('2');
    const arr = createJsonEncoderFn<N[]>();
    expect(arr([N.A, N.C, N.B])).toBe('[0,2,1]');
  });

  test('string enum — quoted via JSON.stringify', () => {
    enum S {
      Red = 'red',
      Green = 'green',
    }
    const sjs = createJsonEncoderFn<S>();
    expect(sjs(S.Red)).toBe('"red"');
    const arr = createJsonEncoderFn<S[]>();
    expect(arr([S.Red, S.Green])).toBe('["red","green"]');
  });
});

describe('createStringifyJson — compound shapes', () => {
  test('object literal — declared keys serialised, parses back', () => {
    type T = {a: string; b: number};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({a: 'hello', b: 42});
    expect(typeof out).toBe('string');
    expect(JSON.parse(out!)).toEqual({a: 'hello', b: 42});
  });

  test('object with bigint field — bigint quoted in output', () => {
    type T = {n: bigint};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({n: 123n});
    expect(out).toBe('{"n":"123"}');
  });

  test('array of atomics', () => {
    const sjs = createJsonEncoderFn<number[]>();
    expect(sjs([1, 2, 3])).toBe('[1,2,3]');
    expect(sjs([])).toBe('[]');
  });

  test('array of bigints — each quoted', () => {
    const sjs = createJsonEncoderFn<bigint[]>();
    const out = sjs([1n, 2n]);
    expect(JSON.parse(out!)).toEqual(['1', '2']);
  });

  test('tuple — slots serialised in order', () => {
    const sjs = createJsonEncoderFn<[number, string, bigint]>();
    const out = sjs([1, 'x', 42n]);
    expect(out).toBe('[1,"x","42"]');
  });

  test('Map<string, number>', () => {
    const sjs = createJsonEncoderFn<Map<string, number>>();
    const m = new Map<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    const out = sjs(m);
    expect(JSON.parse(out!)).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  test('Set<string>', () => {
    const sjs = createJsonEncoderFn<Set<string>>();
    const s = new Set<string>(['a', 'b']);
    const out = sjs(s);
    expect(JSON.parse(out!)).toEqual(['a', 'b']);
  });

  test('optional last + undefined — produces valid JSON (parity sort puts optional first)', () => {
    // Without the optional-first sort, the trailing-comma logic
    // would emit `{"a":"x",}` here — invalid JSON. We port the sort,
    // so optional `b` is emitted FIRST (empty when undefined), then
    // required `a` last (with skipCommas), giving `{"a":"x"}`.
    type T = {a: string; b?: number};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({a: 'x'});
    expect(out).toBe('{"a":"x"}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({a: 'x'});
  });

  test('optional last + present — both keys serialised', () => {
    type T = {a: string; b?: number};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({a: 'x', b: 42});
    expect(JSON.parse(out!)).toEqual({a: 'x', b: 42});
  });
});

// The `compileStringifyInterface` path has TWO modes:
//
//   1. At-least-one-required → static `+` concat with optional-first
//      sort + skipCommas-on-last. Fast; no allocations.
//   2. All-optional → IIFE that pushes each prop into a `ns` array
//      and final-joins with ','. Required because the static + concat
//      shape would emit invalid JSON with a trailing comma when only
//      some of the optional props are present at runtime.
//
// These tests catch the bug-mode where path (2) is missing — the
// emit produces `{"a":"x",}` (trailing comma) and JSON.parse throws.
// They MUST run through the actual RT factory (not JSON.stringify
// fallback) to exercise the emit.
describe('createStringifyJson — all-optional objects (array-join fallback)', () => {
  test('all-optional, first present + second absent — must NOT emit trailing comma', () => {
    type T = {a?: string; b?: string};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({a: 'helloA'});
    // The bug-mode output would be `{"a":"helloA",}` — invalid JSON.
    // After the fix: array-join filter drops the empty `b` slot and
    // the result is the canonical `{"a":"helloA"}`.
    expect(out).toBe('{"a":"helloA"}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({a: 'helloA'});
  });

  test('all-optional, first absent + second present', () => {
    type T = {a?: string; b?: string};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({b: 'helloB'});
    // Leading-empty case — bug-mode might emit `{,"b":"helloB"}`
    // (leading comma) if filter logic is broken.
    expect(out).toBe('{"b":"helloB"}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({b: 'helloB'});
  });

  test('all-optional, middle gap — first + third present, second absent', () => {
    type T = {a?: string; b?: string; c?: string};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({a: 'helloA', c: 'helloC'});
    // Middle-gap case — bug-mode might emit `{"a":"helloA",,"c":"helloC"}`
    // (double comma) if the filter doesn't collapse empty slots.
    expect(out).toBe('{"a":"helloA","c":"helloC"}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({a: 'helloA', c: 'helloC'});
  });

  test('all-optional, all present', () => {
    // Avoid `boolean` here — TS reflects boolean as `true | false`
    // (a union), which would force the [idx, val] tuple-wrap and
    // muddle this test's intent. Atomic-only optional types isolate
    // the all-optional array-join path.
    type T = {a?: string; b?: number; c?: string};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({a: 'x', b: 42, c: 'y'});
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({a: 'x', b: 42, c: 'y'});
  });

  test('all-optional, none present — empty object', () => {
    type T = {a?: string; b?: number};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({});
    expect(out).toBe('{}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({});
  });

  test('all-optional with bigint — array-join path still honours per-kind encoding', () => {
    // Per-kind encoding (bigint quoted) must still happen inside the
    // array-join path — exercises the property emit's value fragment
    // composing correctly under the skipCommas=true mode.
    type T = {n?: bigint; s?: string};
    const sjs = createJsonEncoderFn<T>();
    const out = sjs({n: 123n});
    expect(out).toBe('{"n":"123"}');
    expect(JSON.parse(out!)).toEqual({n: '123'});
  });
});

describe('createStringifyJson — no-mutation invariant (divergence from prepareForJson)', () => {
  test('bigint input field stays a bigint after stringifyJson', () => {
    type T = {n: bigint};
    const sjs = createJsonEncoderFn<T>();
    const input: T = {n: 123n};
    sjs(input);
    // load-bearing: prepareForJson would have rebound `input.n` to
    // the string `'123'`. stringifyJson reads but doesn't write.
    expect(typeof input.n).toBe('bigint');
    expect(input.n).toBe(123n);
  });

  test('nested object with Date field — Date instance preserved', () => {
    type T = {at: Date; tag: string};
    const sjs = createJsonEncoderFn<T>();
    const d = new Date('2000-08-06T02:13:00.000Z');
    const input: T = {at: d, tag: 'x'};
    sjs(input);
    // prepareForJson is a noop on Date (relies on Date.toJSON), but
    // stringifyJson's no-mutation contract is unconditional —
    // assert the slot still holds the Date instance.
    expect(input.at).toBeInstanceOf(Date);
    expect(input.at).toBe(d);
    expect(input.tag).toBe('x');
  });

  test('prepareForJson DOES mutate the same input shape — contrast', () => {
    type T = {n: bigint};
    const prep = createJsonEncoderFn<T>(undefined, {strategy: 'mutate'});
    const input: T = {n: 123n};
    prep(input);
    // contract contrast — prepareForJson rebinds the bigint to its
    // decimal string in place.
    expect(typeof (input as unknown as {n: unknown}).n).toBe('string');
    expect((input as unknown as {n: unknown}).n).toBe('123');
  });
});

describe('createStringifyJson — extras stripped in the EMIT', () => {
  test('JSON-compatible extra is dropped, not preserved', () => {
    type T = {declared: string};
    const sjs = createJsonEncoderFn<T>();
    const input = {declared: 'x', extra: 'y'} as T & {extra: string};
    const out = sjs(input);
    expect(out).toBe('{"declared":"x"}');
  });

  test('bigint extra does NOT throw — emit walks declared members only', () => {
    type T = {declared: string};
    const sjs = createJsonEncoderFn<T>();
    const input = {declared: 'x', extra: 123n} as T & {extra: bigint};
    // Crucially: no throw, and the bigint extra is absent from
    // output. prepareForJson + JSON.stringify on the same input
    // would throw "Do not know how to serialize a BigInt".
    const out = sjs(input);
    expect(out).toBe('{"declared":"x"}');
  });

  test('symbol-valued extra also dropped (no throw)', () => {
    type T = {declared: string};
    const sjs = createJsonEncoderFn<T>();
    const input = {declared: 'x', sym: Symbol('hi')} as T & {sym: symbol};
    const out = sjs(input);
    expect(out).toBe('{"declared":"x"}');
  });

  test('function-valued extra also dropped (no throw)', () => {
    type T = {declared: string};
    const sjs = createJsonEncoderFn<T>();
    const input = {declared: 'x', fn: () => 0} as T & {fn: () => number};
    const out = sjs(input);
    expect(out).toBe('{"declared":"x"}');
  });
});

describe('createStringifyJson vs JSON.stringify(prepareForJson(v)) — parsed-equality', () => {
  // For inputs WITHOUT extras and supported types, the two paths
  // produce parsed-identical output. Byte-level differences (property
  // order) are tolerated by parsing both sides before comparing.

  test('parsed equality: simple object', () => {
    type T = {a: string; b: number};
    const sjs = createJsonEncoderFn<T>();
    const prep = createJsonEncoderFn<T>(undefined, {strategy: 'mutate'});
    const input: T = {a: 'hello', b: 42};
    const fromSjs = JSON.parse(sjs(structuredClone(input))!);
    const fromPrep = JSON.parse(prep(structuredClone(input))!);
    expect(fromSjs).toEqual(fromPrep);
  });

  test('parsed equality: object with bigint', () => {
    type T = {n: bigint; tag: string};
    const sjs = createJsonEncoderFn<T>();
    const prep = createJsonEncoderFn<T>(undefined, {strategy: 'mutate'});
    const input: T = {n: 1234567890123456789n, tag: 'x'};
    const fromSjs = JSON.parse(sjs(structuredClone(input))!);
    const fromPrep = JSON.parse(prep(structuredClone(input))!);
    expect(fromSjs).toEqual(fromPrep);
  });

  test('parsed equality: array of objects with Date + bigint', () => {
    type T = {at: Date; n: bigint}[];
    const sjs = createJsonEncoderFn<T>();
    const prep = createJsonEncoderFn<T>(undefined, {strategy: 'mutate'});
    const d = new Date('2000-08-06T02:13:00.000Z');
    const input: T = [
      {at: d, n: 1n},
      {at: d, n: 2n},
    ];
    const fromSjs = JSON.parse(sjs(structuredClone(input))!);
    const fromPrep = JSON.parse(prep(structuredClone(input))!);
    expect(fromSjs).toEqual(fromPrep);
  });

  test('parsed equality: Map<string, bigint>', () => {
    const safeEnc = createJsonEncoderFn<Map<string, bigint>>();
    const unsafeEnc = createJsonEncoderFn<Map<string, bigint>>(undefined, {strategy: 'mutate'});
    const m = new Map<string, bigint>([
      ['a', 1n],
      ['b', 2n],
    ]);
    const fromSafe = JSON.parse(safeEnc(new Map(m))!);
    const fromUnsafe = JSON.parse(unsafeEnc(new Map(m))!);
    expect(fromSafe).toEqual(fromUnsafe);
  });
});
