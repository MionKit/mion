// A class getter or setter behaves like any other prop in every function, though JS does not list it as a key.

import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, createJsonDecoderFn, createJsonEncoderFn, createValidateFn} from '@mionjs/run-types';

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

class Account {
  name = 'a';
  writes = 0;
  #cents = 1n;
  get cents() {
    return this.#cents;
  }
  set cents(value: bigint) {
    this.writes++;
    this.#cents = value;
  }
  get label() {
    return 'L';
  }
}
type AccountWire = {cents: string; label: string; name: string; writes: number};
const accountWire: AccountWire = {cents: '1', label: 'L', name: 'a', writes: 0};
type Arm = {kind: 'a'; n: number} | Pick<Account, 'cents' | 'name'>;

describe('class accessors — mutate encode', () => {
  const unchanged = (account: Account) => {
    expect(Object.keys(account)).toEqual(['name', 'writes']);
    expect(account.cents).toBe(1n);
    expect(account.writes).toBe(0);
  };

  it('writes the accessors and leaves the instance alone (static shape)', () => {
    const encode = createJsonEncoderFn<Account>(undefined, {strategy: 'mutate'});
    const account = new Account();
    expect(JSON.parse(encode(account) as string)).toEqual(accountWire);
    unchanged(account);
  });

  it('writes the accessors and leaves the instance alone (value shape)', () => {
    const encode = createJsonEncoderFn(new Account(), {strategy: 'mutate'});
    const account = new Account();
    expect(JSON.parse(encode(account) as string)).toEqual(accountWire);
    unchanged(account);
  });

  it('writes a getter that needs no transform (static shape)', () => {
    const encode = createJsonEncoderFn<User>(undefined, {strategy: 'mutate'});
    expect(JSON.parse(encode(new User()) as string)).toEqual({id: 1, name: 'a'});
  });

  it('writes a getter that needs no transform (value shape)', () => {
    const encode = createJsonEncoderFn(new User(), {strategy: 'mutate'});
    expect(JSON.parse(encode(new User()) as string)).toEqual({id: 1, name: 'a'});
  });

  it('keeps an undeclared key, as mutate promises (static shape)', () => {
    const encode = createJsonEncoderFn<User>(undefined, {strategy: 'mutate'});
    expect(JSON.parse(encode(new UserExtra()) as string)).toEqual({extra: 1, id: 1, name: 'a'});
  });

  it('keeps an undeclared key, as mutate promises (value shape)', () => {
    const encode = createJsonEncoderFn(new User(), {strategy: 'mutate'});
    expect(JSON.parse(encode(new UserExtra()) as string)).toEqual({extra: 1, id: 1, name: 'a'});
  });

  it('holds one level deep and in an array (static shape)', () => {
    const encode = createJsonEncoderFn<{one: Account; many: Account[]}>(undefined, {strategy: 'mutate'});
    const one = new Account();
    const item = new Account();
    expect(JSON.parse(encode({one, many: [item]}) as string)).toEqual({one: accountWire, many: [accountWire]});
    unchanged(one);
    unchanged(item);
  });

  it('holds one level deep and in an array (value shape)', () => {
    const sample: {one: Account; many: Account[]} = {one: new Account(), many: []};
    const encode = createJsonEncoderFn(sample, {strategy: 'mutate'});
    const one = new Account();
    const item = new Account();
    expect(JSON.parse(encode({one, many: [item]}) as string)).toEqual({one: accountWire, many: [accountWire]});
    unchanged(one);
    unchanged(item);
  });

  it('copies in a union object arm, and not an absent prop (static shape)', () => {
    const encode = createJsonEncoderFn<Arm>(undefined, {strategy: 'mutate'});
    const decode = createJsonDecoderFn<Arm>(undefined, {strategy: 'mutate'});
    const account = new Account();
    expect(decode(encode(account) as string)).toEqual({cents: 1n, name: 'a', writes: 0});
    unchanged(account);
    expect(decode(encode({kind: 'a', n: 1}) as string)).toEqual({kind: 'a', n: 1});
  });

  it('copies in a union object arm, and not an absent prop (value shape)', () => {
    const sample: Arm = {kind: 'a', n: 1};
    const encode = createJsonEncoderFn(sample, {strategy: 'mutate'});
    const decode = createJsonDecoderFn(sample, {strategy: 'mutate'});
    const account = new Account();
    expect(decode(encode(account) as string)).toEqual({cents: 1n, name: 'a', writes: 0});
    unchanged(account);
    expect(decode(encode({kind: 'a', n: 1}) as string)).toEqual({kind: 'a', n: 1});
  });
});
