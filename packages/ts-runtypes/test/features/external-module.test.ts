// External-module marker matrix, run through the REAL marker package and the
// live plugin: every marker's type /
// schema / preset is defined in a SIBLING module (external-module-library.ts)
// and used here, proving the cross-module path works end-to-end at runtime and
// converges with the inline-defined form.
//
// Per the marker-coverage rule the getRunTypeId case pairs BOTH call shapes
// (reflection `getRunTypeId(value)` first, then static `getRunTypeId<T>()`) and
// asserts hash equivalence between them for an imported type.
import {describe, expect, test} from 'vitest';
import {
  createValidateFn,
  createJsonEncoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  getRunTypeId,
  type InferType,
} from '@mionjs/run-types';
import {UserSchema, mutatePreset, type User, type WithBigint} from '../support/external-module-library.ts';

describe('external-module markers', () => {
  test('getRunTypeId converges across both shapes for an imported type', () => {
    const value: User = {id: 1, name: 'a'};
    const reflectId = getRunTypeId(value); // reflection form (T inferred from value)
    const staticId = getRunTypeId<User>(); // static form (imported type arg)
    const inlineId = getRunTypeId<{id: number; name: string}>(); // inline structural twin

    expect(reflectId).toBe(staticId); // the two call shapes converge
    expect(staticId).toBe(inlineId); // the imported type converges with its inline twin
  });

  test('createValidateFn over an imported type validates the right shape', () => {
    const isUser = createValidateFn<User>();
    expect(isUser({id: 1, name: 'a'})).toBe(true);
    expect(isUser({id: 'x', name: 'a'})).toBe(false); // wrong scalar type
    expect(isUser({id: 1})).toBe(false); // missing field
  });

  test('value-first createValidateFn over an imported schema converges with the static form', () => {
    const fromSchema = createValidateFn(UserSchema); // value-first, imported schema
    const fromType = createValidateFn<InferType<typeof UserSchema>>(); // static, same type

    expect(fromSchema).toBe(fromType); // same structural id ⇒ same cached factory
    expect(fromSchema({id: 1, name: 'a'})).toBe(true);
    expect(fromSchema({id: 1})).toBe(false);
  });

  test('a whole imported const option bag selects the JSON strategy (mutate observed)', () => {
    const encode = createJsonEncoderFn<WithBigint>(undefined, mutatePreset); // whole imported const
    const input: WithBigint = {n: 123n};
    encode(input);
    // mutate rebinds the bigint to its decimal string IN PLACE; had the whole
    // const been dropped, the default clone would have left `n` a bigint.
    expect(typeof (input as unknown as {n: unknown}).n).toBe('string');

    const encodeDefault = createJsonEncoderFn<WithBigint>();
    const untouched: WithBigint = {n: 123n};
    encodeDefault(untouched);
    expect(typeof untouched.n).toBe('bigint');
  });

  test('binary encoder/decoder round-trips over an imported type', () => {
    const enc = createBinaryEncoderFn<User>();
    const dec = createBinaryDecoderFn<User>();
    const user: User = {id: 7, name: 'Ada'};
    expect(dec(enc(user))).toEqual(user);
  });
});
