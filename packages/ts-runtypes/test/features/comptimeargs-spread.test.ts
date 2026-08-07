// CompTimeArgs spread support, exercised through the REAL marker package and
// the live plugin (these imports use the `ts-runtypes` package specifiers, so
// the file is scanned + rewritten the same way consumer code is). Covers the
// three faces of the feature with observable runtime behaviour:
//
//   - builder spread: `object({...base, extra})` reflects the SAME merged type
//     as the fully-inlined object, and its validator checks every merged field;
//   - tuple spread: `tuple([...head, tail])` validates each merged slot;
//   - option-bag spread: a `{...preset}` JSON-strategy preset takes effect
//     (mutate observed), and an inline key overrides the preset (last wins).
//
// Per the marker-coverage rule the convergence test pairs BOTH getRunTypeId
// shapes (static `getRunTypeId<T>()` and reflection `getRunTypeId(value)`) and
// asserts hash equivalence between them.
import {describe, expect, test} from 'vitest';
import {createValidateFn, createJsonEncoderFn, getRunTypeId, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import '@ts-runtypes/core/formats';

describe('CompTimeArgs spread — builders', () => {
  test('object spread converges with the inlined object (both getRunTypeId shapes)', () => {
    const base = {id: TF.number(), name: TF.string()};
    const spreadModel = RT.object({...base, active: RT.boolean()});

    // Marker-coverage rule: cover BOTH getRunTypeId shapes and assert they
    // converge. The reflection form is read first here — a static-then-reflect
    // pair of the SAME object id in one file trips a pre-existing
    // reflection-injection ordering quirk (unrelated to spread; reproduces with
    // a plain `{id: number}` and no builders). Reflect-first sidesteps it.
    const value = {id: 1, name: 'a', active: true};
    const reflectId = getRunTypeId(value); // reflection form (T inferred from value)
    const spreadId = getRunTypeId<InferType<typeof spreadModel>>(); // static form
    const directId = getRunTypeId<{id: number; name: string; active: boolean}>();

    expect(reflectId).toBe(spreadId); // the two call shapes converge on one id
    expect(spreadId).toBe(directId); // the spread merges to the inlined type
  });

  test('object spread produces a validator over the full merged shape', () => {
    const base = {id: TF.number(), name: TF.string()};
    const User = RT.object({...base, active: RT.boolean()});
    const isUser = createValidateFn<InferType<typeof User>>();

    expect(isUser({id: 1, name: 'a', active: true})).toBe(true);
    expect(isUser({id: 1, name: 'a'})).toBe(false); // missing the inline field
    expect(isUser({name: 'a', active: true})).toBe(false); // missing a spread-in field
    expect(isUser({id: 1, name: 2, active: true})).toBe(false); // wrong type on a spread-in field
  });

  test('tuple spread validates each merged slot', () => {
    const head = [TF.number(), TF.string()] as const;
    const Tup = RT.tuple([...head, RT.boolean()]);
    const isTup = createValidateFn<InferType<typeof Tup>>();

    expect(isTup([1, 'a', true])).toBe(true);
    expect(isTup([1, 'a', 'not-bool'])).toBe(false); // wrong type in the inline slot
    expect(isTup(['not-num', 'a', true])).toBe(false); // wrong type in a spread-in slot
  });
});

describe('CompTimeFnArgs spread — option bags', () => {
  // The `mutate` strategy rebinds a bigint field to its decimal string IN PLACE;
  // the default `clone` strategy never mutates its input. That contrast makes the
  // merged strategy observable at runtime.
  type WithBigint = {n: bigint};

  test('a spread preset selects the JSON strategy (mutate observed)', () => {
    const preset = {strategy: 'mutate'} as const;
    const encode = createJsonEncoderFn<WithBigint>(undefined, {...preset});
    const input: WithBigint = {n: 123n};
    encode(input);
    // mutate rebinds in place; had the spread dropped the strategy, the default
    // clone would have left `n` a bigint.
    expect(typeof (input as unknown as {n: unknown}).n).toBe('string');

    // Contrast: the default (clone) leaves the input untouched.
    const encodeDefault = createJsonEncoderFn<WithBigint>();
    const untouched: WithBigint = {n: 123n};
    encodeDefault(untouched);
    expect(typeof untouched.n).toBe('bigint');
  });

  test('an inline strategy overrides the spread preset (last write wins)', () => {
    const preset = {strategy: 'mutate'} as const;
    // Spread says mutate, inline says clone → clone wins → no mutation.
    const encode = createJsonEncoderFn<WithBigint>(undefined, {...preset, strategy: 'clone'});
    const input: WithBigint = {n: 123n};
    encode(input);
    expect(typeof input.n).toBe('bigint');
  });
});
