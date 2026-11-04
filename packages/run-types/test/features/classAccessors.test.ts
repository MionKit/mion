// A class getter or setter behaves like any other prop in every function, though JS does not list it as a key.

import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, createJsonEncoderFn, createValidateFn} from '@mionjs/run-types';

class User {
  name = 'a';
  get id() {
    return 1;
  }
}
class UserExtra extends User {
  extra = 1;
}
type UserShape = {id: number; name: string};
type Holder = {user: User; tag: string};
type PlainHolder = {user: UserShape; tag: string};

const extraError = (...path: string[]) => [{path: [...path, 'extra'], expected: 'never'}];

describe('class accessors — strict', () => {
  it('passes the instance and fails an extra key (static shape)', () => {
    const isStrict = createValidateFn<User>(undefined, {checkUnknowns: true});
    const errorsStrict = createGetValidationErrorsFn<User>(undefined, {checkUnknowns: true});
    expect([isStrict(new User()), errorsStrict(new User())]).toEqual([true, []]);
    expect([isStrict(new UserExtra()), errorsStrict(new UserExtra())]).toEqual([false, extraError()]);
  });

  it('passes the instance and fails an extra key (value shape)', () => {
    const sample = new User();
    const isStrict = createValidateFn(sample, {checkUnknowns: true});
    const errorsStrict = createGetValidationErrorsFn(sample, {checkUnknowns: true});
    expect([isStrict(new User()), errorsStrict(new User())]).toEqual([true, []]);
    expect([isStrict(new UserExtra()), errorsStrict(new UserExtra())]).toEqual([false, extraError()]);
  });

  it('holds one level deep (static shape)', () => {
    const isStrict = createValidateFn<Holder>(undefined, {checkUnknowns: true});
    const errorsStrict = createGetValidationErrorsFn<Holder>(undefined, {checkUnknowns: true});
    expect(isStrict({user: new User(), tag: 't'})).toBe(true);
    expect(errorsStrict({user: new UserExtra(), tag: 't'})).toEqual(extraError('user'));
  });

  it('holds one level deep (value shape)', () => {
    const sample: Holder = {user: new User(), tag: 't'};
    const isStrict = createValidateFn(sample, {checkUnknowns: true});
    const errorsStrict = createGetValidationErrorsFn(sample, {checkUnknowns: true});
    expect(isStrict({user: new User(), tag: 't'})).toBe(true);
    expect(errorsStrict({user: new UserExtra(), tag: 't'})).toEqual(extraError('user'));
  });

  it('reads a class value through a plain type by name (static shape)', () => {
    const isStrict = createValidateFn<PlainHolder>(undefined, {checkUnknowns: true});
    expect(isStrict({user: new User(), tag: 't'})).toBe(true);
    expect(isStrict({user: new UserExtra(), tag: 't'})).toBe(false);
  });

  it('reads a class value through a plain type by name (value shape)', () => {
    const sample: PlainHolder = {user: {id: 1, name: 'a'}, tag: 't'};
    const isStrict = createValidateFn(sample, {checkUnknowns: true});
    expect(isStrict({user: new User(), tag: 't'})).toBe(true);
    expect(isStrict({user: new UserExtra(), tag: 't'})).toBe(false);
  });
});

describe('class accessors — clone encode of a plain type', () => {
  const wire = {id: 1, name: 'a'};

  it('keeps the getter and drops an extra key (static shape)', () => {
    const encode = createJsonEncoderFn<UserShape>();
    expect(JSON.parse(encode(new User()) as string)).toEqual(wire);
    expect(JSON.parse(encode(new UserExtra()) as string)).toEqual(wire);
  });

  it('keeps the getter and drops an extra key (value shape)', () => {
    const sample: UserShape = {id: 1, name: 'a'};
    const encode = createJsonEncoderFn(sample);
    expect(JSON.parse(encode(new User()) as string)).toEqual(wire);
    expect(JSON.parse(encode(new UserExtra()) as string)).toEqual(wire);
  });
});
