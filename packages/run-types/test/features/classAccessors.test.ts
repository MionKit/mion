// A class getter or setter behaves like any other prop in every function, though JS does not list it as a key.

import {afterEach, describe, expect, it} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import '@mionjs/run-types/formats';
import {
  createFormatTransformFn,
  createGetValidationErrorsFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createJsonSchemaFn,
  createRemoveUnknownKeysFn,
  createValidateFn,
  type DataOnly,
} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {registerClassSerializer} from '@mionjs/run-types/runtime';
import {clearClassSerializers} from '../../src/runtypes/classSerializerRegistry.ts';

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

  it('holds in a union and an array, for validate and errors alike (static shape)', () => {
    const isUnion = createValidateFn<User | {other: string}>(undefined, {checkUnknowns: true});
    const unionErrors = createGetValidationErrorsFn<User | {other: string}>(undefined, {checkUnknowns: true});
    const isList = createValidateFn<User[]>(undefined, {checkUnknowns: true});
    const listErrors = createGetValidationErrorsFn<User[]>(undefined, {checkUnknowns: true});
    expect([isUnion(new User()), unionErrors(new User())]).toEqual([true, []]);
    expect(isUnion(new UserExtra())).toBe(false);
    expect(unionErrors(new UserExtra())).not.toEqual([]);
    expect([isList([new User()]), listErrors([new User()])]).toEqual([true, []]);
    expect([isList([new UserExtra()]), listErrors([new UserExtra()])]).toEqual([
      false,
      [{path: [0, 'extra'], expected: 'never'}],
    ]);
  });

  it('holds in a union and an array, for validate and errors alike (value shape)', () => {
    const unionSample: User | {other: string} = new User();
    const listSample: User[] = [new User()];
    const isUnion = createValidateFn(unionSample, {checkUnknowns: true});
    const unionErrors = createGetValidationErrorsFn(unionSample, {checkUnknowns: true});
    const isList = createValidateFn(listSample, {checkUnknowns: true});
    const listErrors = createGetValidationErrorsFn(listSample, {checkUnknowns: true});
    expect([isUnion(new User()), unionErrors(new User())]).toEqual([true, []]);
    expect(isUnion(new UserExtra())).toBe(false);
    expect(unionErrors(new UserExtra())).not.toEqual([]);
    expect([isList([new User()]), listErrors([new User()])]).toEqual([true, []]);
    expect([isList([new UserExtra()]), listErrors([new UserExtra()])]).toEqual([
      false,
      [{path: [0, 'extra'], expected: 'never'}],
    ]);
  });

  it('holds with union member keys (static shape)', () => {
    const isUnion = createValidateFn<{other: string} | User>(undefined, {checkUnionUnknowns: true});
    expect(isUnion(new User())).toBe(true);
    expect(isUnion(new UserExtra())).toBe(false);
  });

  it('holds with union member keys (value shape)', () => {
    const sample: {other: string} | User = new User();
    const isUnion = createValidateFn(sample, {checkUnionUnknowns: true});
    expect(isUnion(new User())).toBe(true);
    expect(isUnion(new UserExtra())).toBe(false);
  });

  it('a plain type reads a getter on a class value (static shape)', () => {
    const isStrict = createValidateFn<UserShape>(undefined, {checkUnknowns: true});
    const errorsStrict = createGetValidationErrorsFn<UserShape>(undefined, {checkUnknowns: true});
    expect([isStrict(new User()), errorsStrict(new User())]).toEqual([true, []]);
    expect([isStrict(new UserExtra()), errorsStrict(new UserExtra())]).toEqual([false, extraError()]);
  });

  it('a plain type reads a getter on a class value (value shape)', () => {
    const sample: UserShape = {id: 1, name: 'a'};
    const isStrict = createValidateFn(sample, {checkUnknowns: true});
    const errorsStrict = createGetValidationErrorsFn(sample, {checkUnknowns: true});
    expect([isStrict(new User()), errorsStrict(new User())]).toEqual([true, []]);
    expect([isStrict(new UserExtra()), errorsStrict(new UserExtra())]).toEqual([false, extraError()]);
  });

  it('a plain type holds one level deep on a class value (static shape)', () => {
    const isStrict = createValidateFn<PlainHolder>(undefined, {checkUnknowns: true});
    expect(isStrict({user: new User(), tag: 't'})).toBe(true);
    expect(isStrict({user: new UserExtra(), tag: 't'})).toBe(false);
  });

  it('a plain type holds one level deep on a class value (value shape)', () => {
    const sample: PlainHolder = {user: {id: 1, name: 'a'}, tag: 't'};
    const isStrict = createValidateFn(sample, {checkUnknowns: true});
    expect(isStrict({user: new User(), tag: 't'})).toBe(true);
    expect(isStrict({user: new UserExtra(), tag: 't'})).toBe(false);
  });
});

describe('class accessors — plain validate', () => {
  const missing = [{path: ['id'], expected: 'number'}];

  it('a declared getter is required and typed (static shape)', () => {
    const isUser = createValidateFn<User>();
    expect(isUser(new User())).toBe(true);
    expect(isUser({id: 1, name: 'a'})).toBe(true);
    expect(isUser({name: 'a'})).toBe(false);
    expect(isUser({id: 'x', name: 'a'})).toBe(false);
    expect(createGetValidationErrorsFn<User>()({name: 'a'})).toEqual(missing);
  });

  it('a declared getter is required and typed (value shape)', () => {
    const sample = new User();
    const isUser = createValidateFn(sample);
    expect(isUser(new User())).toBe(true);
    expect(isUser({id: 1, name: 'a'} as User)).toBe(true);
    expect(isUser({name: 'a'} as User)).toBe(false);
    expect(isUser({id: 'x', name: 'a'} as unknown as User)).toBe(false);
    expect(createGetValidationErrorsFn(sample)({name: 'a'} as User)).toEqual(missing);
  });
});

describe('class accessors — clone encode', () => {
  const wire = {id: 1, name: 'a'};

  it('keeps the getter and drops an extra key (static shape)', () => {
    const encode = createJsonEncoderFn<User>();
    expect(JSON.parse(encode(new User()) as string)).toEqual(wire);
    expect(JSON.parse(encode(new UserExtra()) as string)).toEqual(wire);
  });

  it('keeps the getter and drops an extra key (value shape)', () => {
    const encode = createJsonEncoderFn(new User());
    expect(JSON.parse(encode(new User()) as string)).toEqual(wire);
    expect(JSON.parse(encode(new UserExtra()) as string)).toEqual(wire);
  });

  it('holds one level deep (static shape)', () => {
    const encode = createJsonEncoderFn<Holder>();
    const expected = {user: wire, tag: 't'};
    expect(JSON.parse(encode({user: new User(), tag: 't'}) as string)).toEqual(expected);
    expect(JSON.parse(encode({user: new UserExtra(), tag: 't'}) as string)).toEqual(expected);
  });

  it('holds one level deep (value shape)', () => {
    const sample: Holder = {user: new User(), tag: 't'};
    const encode = createJsonEncoderFn(sample);
    const expected = {user: wire, tag: 't'};
    expect(JSON.parse(encode({user: new User(), tag: 't'}) as string)).toEqual(expected);
    expect(JSON.parse(encode({user: new UserExtra(), tag: 't'}) as string)).toEqual(expected);
  });

  it('keeps the getter in a union with a record, on clone and compact (static shape)', () => {
    type Open = Record<string, boolean> | UserInterface;
    const expected = [-1, wire];
    expect(JSON.parse(createJsonEncoderFn<Open>()(new User()) as string)).toEqual(expected);
    expect(JSON.parse(createJsonEncoderFn<Open>(undefined, {strategy: 'compact'})(new User()) as string)).toEqual(expected);
  });

  it('keeps the getter in a union with a record, on clone and compact (value shape)', () => {
    const sample: Record<string, boolean> | UserInterface = new User();
    const expected = [-1, wire];
    expect(JSON.parse(createJsonEncoderFn(sample)(new User()) as string)).toEqual(expected);
    expect(JSON.parse(createJsonEncoderFn(sample, {strategy: 'compact'})(new User()) as string)).toEqual(expected);
  });

  it('a plain type writes the getter of a class value, never an extra key (static shape)', () => {
    const encode = createJsonEncoderFn<UserShape>();
    expect(JSON.parse(encode(new User()) as string)).toEqual({id: 1, name: 'a'});
    expect(JSON.parse(encode(new UserExtra()) as string)).toEqual({id: 1, name: 'a'});
  });

  it('a plain type writes the getter of a class value, never an extra key (value shape)', () => {
    const sample: UserShape = {id: 1, name: 'a'};
    const encode = createJsonEncoderFn(sample);
    expect(JSON.parse(encode(new User()) as string)).toEqual({id: 1, name: 'a'});
    expect(JSON.parse(encode(new UserExtra()) as string)).toEqual({id: 1, name: 'a'});
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
type Arm = {kind: 'a'; count: bigint} | Pick<Account, 'cents' | 'label' | 'name'>;

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

  it('copies every accessor in a union object arm, and a plain arm stays in place (static shape)', () => {
    const encode = createJsonEncoderFn<Arm>(undefined, {strategy: 'mutate'});
    const decode = createJsonDecoderFn<Arm>(undefined, {strategy: 'mutate'});
    const account = new Account();
    expect(decode(encode(account) as string)).toEqual({cents: 1n, label: 'L', name: 'a', writes: 0});
    unchanged(account);
    const plain: Arm = {kind: 'a', count: 1n};
    const wire = encode(plain) as string;
    expect(plain.count as unknown).not.toBe(1n);
    expect(decode(wire)).toEqual({kind: 'a', count: 1n});
  });

  it('copies every accessor in a union object arm, and a plain arm stays in place (value shape)', () => {
    const sample: Arm = {kind: 'a', count: 1n};
    const encode = createJsonEncoderFn(sample, {strategy: 'mutate'});
    const decode = createJsonDecoderFn(sample, {strategy: 'mutate'});
    const account = new Account();
    expect(decode(encode(account) as string)).toEqual({cents: 1n, label: 'L', name: 'a', writes: 0});
    unchanged(account);
    const plain: Arm = {kind: 'a', count: 1n};
    const wire = encode(plain) as string;
    expect(plain.count as unknown).not.toBe(1n);
    expect(decode(wire)).toEqual({kind: 'a', count: 1n});
  });
});

class Lazy {
  name = 'a';
  reads = 0;
  get rx(): RegExp {
    this.reads++;
    return /a/;
  }
  get later(): Promise<number> {
    this.reads++;
    return Promise.resolve(1);
  }
}
type LazyArm = {kind: 'a'} | Pick<Lazy, 'later' | 'name' | 'reads'>;

describe('class accessors — a getter the data shape strips', () => {
  const wire = {name: 'a', reads: 0};

  it('is never read by a mutate encode (static shape)', () => {
    const encode = createJsonEncoderFn<Lazy>(undefined, {strategy: 'mutate'});
    expect(JSON.parse(encode(new Lazy()) as string)).toEqual(wire);
  });

  it('is never read by a mutate encode (value shape)', () => {
    const encode = createJsonEncoderFn(new Lazy(), {strategy: 'mutate'});
    expect(JSON.parse(encode(new Lazy()) as string)).toEqual(wire);
  });

  it('is never read in a union object arm (static shape)', () => {
    const encode = createJsonEncoderFn<LazyArm>(undefined, {strategy: 'mutate'});
    const decode = createJsonDecoderFn<LazyArm>(undefined, {strategy: 'mutate'});
    expect(decode(encode(new Lazy()) as string)).toEqual(wire);
  });

  it('is never read in a union object arm (value shape)', () => {
    const sample: LazyArm = {kind: 'a'};
    const encode = createJsonEncoderFn(sample, {strategy: 'mutate'});
    const decode = createJsonDecoderFn(sample, {strategy: 'mutate'});
    expect(decode(encode(new Lazy()) as string)).toEqual(wire);
  });
});

// Node cannot run the `accessor` the test build leaves as written: the type uses the keyword, the value its compiled form.
declare class Auto {
  name: string;
  accessor count: number;
  accessor big: bigint;
}
class AutoInstance {
  name = 'a';
  #count = 1;
  #big = 1n;
  get count() {
    return this.#count;
  }
  set count(value: number) {
    this.#count = value;
  }
  get big() {
    return this.#big;
  }
  set big(value: bigint) {
    this.#big = value;
  }
}
const newAuto = (): Auto => new AutoInstance();
const autoWire = {big: '1', count: 1, name: 'a'};

describe('class accessors — the accessor keyword', () => {
  const expectUntouched = (auto: Auto) => expect([auto.big, Object.keys(auto)]).toEqual([1n, ['name']]);

  it('encodes on a copy and keeps the value (static shape)', () => {
    const auto = newAuto();
    expect(JSON.parse(createJsonEncoderFn<Auto>(undefined, {strategy: 'mutate'})(auto) as string)).toEqual(autoWire);
    expectUntouched(auto);
  });

  it('encodes on a copy and keeps the value (value shape)', () => {
    const auto = newAuto();
    expect(JSON.parse(createJsonEncoderFn(newAuto(), {strategy: 'mutate'})(auto) as string)).toEqual(autoWire);
    expectUntouched(auto);
  });

  it('stays on the prototype in removeUnknownKeys (static shape)', () => {
    expect(Object.keys(createRemoveUnknownKeysFn<Auto>()(newAuto()))).toEqual(['name']);
  });

  it('stays on the prototype in removeUnknownKeys (value shape)', () => {
    expect(Object.keys(createRemoveUnknownKeysFn(newAuto())(newAuto()))).toEqual(['name']);
  });

  it('passes strict (static shape)', () => {
    expect(createValidateFn<Auto>(undefined, {checkUnknowns: true})(newAuto())).toBe(true);
  });

  it('passes strict (value shape)', () => {
    expect(createValidateFn(newAuto(), {checkUnknowns: true})(newAuto())).toBe(true);
  });
});

class Tag {
  name = 'a';
  sets = 0;
  #code = 'c';
  get code() {
    return this.#code;
  }
  set code(value: string) {
    this.sets++;
    this.#code = value;
  }
  get upper() {
    return this.#code.toUpperCase();
  }
}
const tagWire = {code: 'x', name: 'n', sets: 0, upper: 'X'};
const tagJson = JSON.stringify(tagWire);

describe('class accessors — decode', () => {
  afterEach(() => clearClassSerializers());

  it('a plain result keeps the wire key (static shape)', () => {
    expect(createJsonDecoderFn<Tag>()(tagJson)).toEqual(tagWire);
  });

  it('a plain result keeps the wire key (value shape)', () => {
    expect(createJsonDecoderFn(new Tag())(tagJson)).toEqual(tagWire);
  });

  it('a registered class skips the getter and runs the setter (static shape)', () => {
    registerClassSerializer(Tag, {});
    const tag = createJsonDecoderFn<Tag>()(tagJson);
    expect(tag).toBeInstanceOf(Tag);
    expect([tag.code, tag.upper]).toEqual(['x', 'X']);
  });

  it('a registered class skips the getter and runs the setter (value shape)', () => {
    registerClassSerializer(Tag, {});
    const tag = createJsonDecoderFn(new Tag())(tagJson);
    expect(tag).toBeInstanceOf(Tag);
    expect([tag.code, tag.upper]).toEqual(['x', 'X']);
  });

  it('holds one level deep (static shape)', () => {
    registerClassSerializer(Tag, {});
    const decoded = createJsonDecoderFn<{tag: Tag}>()(`{"tag":${tagJson}}`);
    expect([decoded.tag.code, decoded.tag.upper]).toEqual(['x', 'X']);
  });

  it('holds one level deep (value shape)', () => {
    registerClassSerializer(Tag, {});
    const sample: {tag: Tag} = {tag: new Tag()};
    const decoded = createJsonDecoderFn(sample)(`{"tag":${tagJson}}`);
    expect([decoded.tag.code, decoded.tag.upper]).toEqual(['x', 'X']);
  });
});

describe('class accessors — round trip', () => {
  afterEach(() => clearClassSerializers());

  const source = () => {
    const tag = new Tag();
    tag.name = 'n';
    tag.code = 'x';
    tag.sets = 0;
    return tag;
  };

  const plainTag = {code: 'x', name: 'n', sets: 0, upper: 'X'};

  it('without a registered class every strategy gives a plain value that validates (static shape)', () => {
    const isTag = createValidateFn<Tag>();
    const roundTrips = [
      (tag: Tag) => createJsonDecoderFn<Tag>()(createJsonEncoderFn<Tag>()(tag) as string),
      (tag: Tag) =>
        createJsonDecoderFn<Tag>(undefined, {strategy: 'mutate'})(
          createJsonEncoderFn<Tag>(undefined, {strategy: 'mutate'})(tag) as string
        ),
      (tag: Tag) =>
        createJsonDecoderFn<Tag>(undefined, {strategy: 'compact'})(
          createJsonEncoderFn<Tag>(undefined, {strategy: 'compact'})(tag) as string
        ),
    ];
    for (const roundTrip of roundTrips) {
      const decoded = roundTrip(source());
      expect(decoded).toEqual(plainTag);
      expect(isTag(decoded)).toBe(true);
    }
  });

  it('without a registered class every strategy gives a plain value that validates (value shape)', () => {
    const sample = new Tag();
    const isTag = createValidateFn(sample);
    const roundTrips = [
      (tag: Tag) => createJsonDecoderFn(sample)(createJsonEncoderFn(sample)(tag) as string),
      (tag: Tag) =>
        createJsonDecoderFn(sample, {strategy: 'mutate'})(createJsonEncoderFn(sample, {strategy: 'mutate'})(tag) as string),
      (tag: Tag) =>
        createJsonDecoderFn(sample, {strategy: 'compact'})(createJsonEncoderFn(sample, {strategy: 'compact'})(tag) as string),
    ];
    for (const roundTrip of roundTrips) {
      const decoded = roundTrip(source());
      expect(decoded).toEqual(plainTag);
      expect(isTag(decoded)).toBe(true);
    }
  });

  it('every strategy encodes, decodes and validates (static shape)', () => {
    registerClassSerializer(Tag, {});
    const isTag = createValidateFn<Tag>();
    const roundTrips = [
      (tag: Tag) => createJsonDecoderFn<Tag>()(createJsonEncoderFn<Tag>()(tag) as string),
      (tag: Tag) =>
        createJsonDecoderFn<Tag>(undefined, {strategy: 'mutate'})(
          createJsonEncoderFn<Tag>(undefined, {strategy: 'mutate'})(tag) as string
        ),
      (tag: Tag) =>
        createJsonDecoderFn<Tag>(undefined, {strategy: 'compact'})(
          createJsonEncoderFn<Tag>(undefined, {strategy: 'compact'})(tag) as string
        ),
    ];
    for (const roundTrip of roundTrips) {
      const original = source();
      const decoded = roundTrip(original);
      expect(decoded).toBeInstanceOf(Tag);
      expect([decoded.code, decoded.upper, decoded.name]).toEqual(['x', 'X', 'n']);
      expect(isTag(decoded)).toBe(true);
      expect(original.sets).toBe(0);
    }
  });

  it('every strategy encodes, decodes and validates (value shape)', () => {
    registerClassSerializer(Tag, {});
    const sample = new Tag();
    const isTag = createValidateFn(sample);
    const roundTrips = [
      (tag: Tag) => createJsonDecoderFn(sample)(createJsonEncoderFn(sample)(tag) as string),
      (tag: Tag) =>
        createJsonDecoderFn(sample, {strategy: 'mutate'})(createJsonEncoderFn(sample, {strategy: 'mutate'})(tag) as string),
      (tag: Tag) =>
        createJsonDecoderFn(sample, {strategy: 'compact'})(createJsonEncoderFn(sample, {strategy: 'compact'})(tag) as string),
    ];
    for (const roundTrip of roundTrips) {
      const original = source();
      const decoded = roundTrip(original);
      expect(decoded).toBeInstanceOf(Tag);
      expect([decoded.code, decoded.upper, decoded.name]).toEqual(['x', 'X', 'n']);
      expect(isTag(decoded)).toBe(true);
      expect(original.sets).toBe(0);
    }
  });
});

class Formatted {
  #pair = '  p  ';
  writes = 0;
  get pair(): TF.Transform<string, {trim: true}> {
    return this.#pair;
  }
  set pair(value: TF.Transform<string, {trim: true}>) {
    this.writes++;
    this.#pair = value;
  }
  get only(): TF.Transform<string, {trim: true}> {
    return '  o  ';
  }
}

describe('class accessors — format transform', () => {
  it('skips a getter and goes through a setter (static shape)', () => {
    const value = new Formatted();
    const result = createFormatTransformFn<Formatted>()(value);
    expect([result.pair, result.only, value.writes]).toEqual(['p', '  o  ', 1]);
  });

  it('skips a getter and goes through a setter (value shape)', () => {
    const value = new Formatted();
    const result = createFormatTransformFn(new Formatted())(value);
    expect([result.pair, result.only, value.writes]).toEqual(['p', '  o  ', 1]);
  });

  it('holds one level deep (static shape)', () => {
    const value = {inner: new Formatted()};
    const result = createFormatTransformFn<{inner: Formatted}>()(value);
    expect([result.inner.pair, result.inner.only]).toEqual(['p', '  o  ']);
  });

  it('holds one level deep (value shape)', () => {
    const sample: {inner: Formatted} = {inner: new Formatted()};
    const result = createFormatTransformFn(sample)({inner: new Formatted()});
    expect([result.inner.pair, result.inner.only]).toEqual(['p', '  o  ']);
  });

  it('a copy of a getter formats a plain value and leaves a class value (static shape)', () => {
    type Copy = Pick<Formatted, 'only'>;
    const format = createFormatTransformFn<Copy>();
    expect(format({only: '  o  '})).toEqual({only: 'o'});
    expect(format(Object.assign(Object.create(null), {only: '  o  '})).only).toBe('o');
    expect(format(new Formatted()).only).toBe('  o  ');
  });

  it('a copy of a getter formats a plain value and leaves a class value (value shape)', () => {
    const sample: Pick<Formatted, 'only'> = {only: '  o  '};
    const format = createFormatTransformFn(sample);
    expect(format({only: '  o  '})).toEqual({only: 'o'});
    expect(format(Object.assign(Object.create(null), {only: '  o  '})).only).toBe('o');
    expect(format(new Formatted()).only).toBe('  o  ');
  });
});

describe('class accessors — a plain type trusts a plain value', () => {
  type PlainFormat = {only: TF.Transform<string, {trim: true}>};
  type PlainAccount = {cents: bigint; name: string};

  it('a format and a mutate encode write to the instance (static shape)', () => {
    expect(() => createFormatTransformFn<PlainFormat>()(new Formatted())).toThrow(TypeError);
    const account = new Account();
    createJsonEncoderFn<PlainAccount>(undefined, {strategy: 'mutate'})(account);
    expect(account.writes).toBe(1);
  });

  it('a format and a mutate encode write to the instance (value shape)', () => {
    const formatSample: PlainFormat = {only: 'o'};
    const accountSample: PlainAccount = {cents: 1n, name: 'a'};
    expect(() => createFormatTransformFn(formatSample)(new Formatted())).toThrow(TypeError);
    const account = new Account();
    createJsonEncoderFn(accountSample, {strategy: 'mutate'})(account);
    expect(account.writes).toBe(1);
  });
});

class Tagged {
  /** @accessor */
  plain = 1;
  /** @accessorNoSetter */
  other = 2;
}

describe('class accessors — removeUnknownKeys', () => {
  it('drops an extra key and keeps the getter (static shape)', () => {
    const result = createRemoveUnknownKeysFn<User>()(new UserExtra());
    expect([Object.keys(result), result.id]).toEqual([['name'], 1]);
  });

  it('drops an extra key and keeps the getter (value shape)', () => {
    const result = createRemoveUnknownKeysFn(new User())(new UserExtra());
    expect([Object.keys(result), result.id]).toEqual([['name'], 1]);
  });

  it('holds one level deep (static shape)', () => {
    const result = createRemoveUnknownKeysFn<Holder>()({user: new UserExtra(), tag: 't'});
    expect([Object.keys(result.user), result.user.id]).toEqual([['name'], 1]);
  });

  it('holds one level deep (value shape)', () => {
    const sample: Holder = {user: new User(), tag: 't'};
    const result = createRemoveUnknownKeysFn(sample)({user: new UserExtra(), tag: 't'});
    expect([Object.keys(result.user), result.user.id]).toEqual([['name'], 1]);
  });

  it('a plain copy stores the value as its own key (static shape)', () => {
    expect(createRemoveUnknownKeysFn<Pick<User, 'id' | 'name'>>()(new UserExtra())).toEqual({id: 1, name: 'a'});
  });

  it('a plain copy stores the value as its own key (value shape)', () => {
    const sample: Pick<User, 'id' | 'name'> = {id: 1, name: 'a'};
    expect(createRemoveUnknownKeysFn(sample)(new UserExtra())).toEqual({id: 1, name: 'a'});
  });

  it('a doc comment does not turn a field into an accessor (static shape)', () => {
    expect(Object.keys(createRemoveUnknownKeysFn<Tagged>()(new Tagged()))).toEqual(['plain', 'other']);
  });

  it('a doc comment does not turn a field into an accessor (value shape)', () => {
    expect(Object.keys(createRemoveUnknownKeysFn(new Tagged())(new Tagged()))).toEqual(['plain', 'other']);
  });
});

class SetterOnly {
  name = 'a';
  set secret(_value: string) {
    throw new Error('never called');
  }
}
class Mixed {
  name = 'a';
  #level = '1';
  get level(): string {
    return this.#level;
  }
  set level(value: number) {
    this.#level = String(value);
  }
}
abstract class Base {
  name = 'a';
  abstract get id(): number;
}
class Concrete extends Base {
  get id() {
    return 1;
  }
}
class Child extends User {}
class WithStatic {
  name = 'a';
  static get total() {
    return 1;
  }
}
class WithPrivate {
  name = 'a';
  private get secret() {
    return 's';
  }
  reveal() {
    return this.secret;
  }
}

type MemberKinds = {setter: SetterOnly; mixed: Mixed; concrete: Base; child: Child; withStatic: WithStatic};
const memberKinds = (): MemberKinds => ({
  setter: new SetterOnly(),
  mixed: new Mixed(),
  concrete: new Concrete(),
  child: new Child(),
  withStatic: new WithStatic(),
});
const memberKindsWire = {
  setter: {name: 'a'},
  mixed: {level: '1', name: 'a'},
  concrete: {id: 1, name: 'a'},
  child: {id: 1, name: 'a'},
  withStatic: {name: 'a'},
};

describe('class accessors — member kinds', () => {
  afterEach(() => clearClassSerializers());

  it('a setter-only member is optional and never called (static shape)', () => {
    expect(createValidateFn<SetterOnly>()(new SetterOnly())).toBe(true);
    expect(createValidateFn<SetterOnly>()({name: 'a', secret: 1})).toBe(false);
    expect(createValidateFn<SetterOnly>(undefined, {checkUnknowns: true})(new SetterOnly())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn<SetterOnly>()(new SetterOnly()) as string)).toEqual({name: 'a'});
    expect(JSON.parse(createJsonEncoderFn<SetterOnly>(undefined, {strategy: 'mutate'})(new SetterOnly()) as string)).toEqual({
      name: 'a',
    });
  });

  it('a setter-only member is optional and never called (value shape)', () => {
    const sample = new SetterOnly();
    expect(createValidateFn(sample)(new SetterOnly())).toBe(true);
    expect(createValidateFn(sample)({name: 'a', secret: 1})).toBe(false);
    expect(createValidateFn(sample, {checkUnknowns: true})(new SetterOnly())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn(sample)(new SetterOnly()) as string)).toEqual({name: 'a'});
    expect(JSON.parse(createJsonEncoderFn(sample, {strategy: 'mutate'})(new SetterOnly()) as string)).toEqual({name: 'a'});
  });

  it('a rebuild never hands a wire value to a setter-only member (static shape)', () => {
    registerClassSerializer(SetterOnly, {});
    const decoded = createJsonDecoderFn<SetterOnly>()('{"name":"b","secret":123}');
    expect([decoded, decoded.name]).toEqual([expect.any(SetterOnly), 'b']);
  });

  it('a rebuild never hands a wire value to a setter-only member (value shape)', () => {
    registerClassSerializer(SetterOnly, {});
    const decoded = createJsonDecoderFn(new SetterOnly())('{"name":"b","secret":123}');
    expect([decoded, decoded.name]).toEqual([expect.any(SetterOnly), 'b']);
  });

  it('mixed get and set types carry the read type, and a rebuild skips it (static shape)', () => {
    registerClassSerializer(Mixed, {});
    expect(JSON.parse(createJsonEncoderFn<Mixed>()(new Mixed()) as string)).toEqual({level: '1', name: 'a'});
    expect(createJsonDecoderFn<Mixed>()('{"level":"9","name":"b"}').level).toBe('1');
    expect(createValidateFn<Mixed>()(new Mixed())).toBe(true);
  });

  it('mixed get and set types carry the read type, and a rebuild skips it (value shape)', () => {
    registerClassSerializer(Mixed, {});
    const sample = new Mixed();
    expect(JSON.parse(createJsonEncoderFn(sample)(new Mixed()) as string)).toEqual({level: '1', name: 'a'});
    expect(createJsonDecoderFn(sample)('{"level":"9","name":"b"}').level).toBe('1');
    expect(createValidateFn(sample)(new Mixed())).toBe(true);
  });

  it('abstract and inherited accessors are read like any prop (static shape)', () => {
    expect(createValidateFn<Base>(undefined, {checkUnknowns: true})(new Concrete())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn<Base>()(new Concrete()) as string)).toEqual({id: 1, name: 'a'});
    expect(createValidateFn<Child>(undefined, {checkUnknowns: true})(new Child())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn<Child>(undefined, {strategy: 'mutate'})(new Child()) as string)).toEqual({
      id: 1,
      name: 'a',
    });
  });

  it('abstract and inherited accessors are read like any prop (value shape)', () => {
    const base: Base = new Concrete();
    const child = new Child();
    expect(createValidateFn(base, {checkUnknowns: true})(new Concrete())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn(base)(new Concrete()) as string)).toEqual({id: 1, name: 'a'});
    expect(createValidateFn(child, {checkUnknowns: true})(new Child())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn(child, {strategy: 'mutate'})(new Child()) as string)).toEqual({id: 1, name: 'a'});
  });

  it('a static getter stays out, a private one encodes like a private field (static shape)', () => {
    expect(createValidateFn<WithStatic>(undefined, {checkUnknowns: true})(new WithStatic())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn<WithStatic>()(new WithStatic()) as string)).toEqual({name: 'a'});
    expect(JSON.parse(createJsonEncoderFn<WithPrivate>()(new WithPrivate()) as string)).toEqual({name: 'a', secret: 's'});
  });

  it('a static getter stays out, a private one encodes like a private field (value shape)', () => {
    const withStatic = new WithStatic();
    const withPrivate = new WithPrivate();
    expect(createValidateFn(withStatic, {checkUnknowns: true})(new WithStatic())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn(withStatic)(new WithStatic()) as string)).toEqual({name: 'a'});
    expect(JSON.parse(createJsonEncoderFn(withPrivate)(new WithPrivate()) as string)).toEqual({name: 'a', secret: 's'});
  });
});

describe('class accessors — member kinds one level deep', () => {
  it('pass strict and encode like a prop (static shape)', () => {
    expect(createValidateFn<MemberKinds>(undefined, {checkUnknowns: true})(memberKinds())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn<MemberKinds>()(memberKinds()) as string)).toEqual(memberKindsWire);
    const mutate = createJsonEncoderFn<MemberKinds>(undefined, {strategy: 'mutate'});
    expect(JSON.parse(mutate(memberKinds()) as string)).toEqual(memberKindsWire);
  });

  it('pass strict and encode like a prop (value shape)', () => {
    const sample = memberKinds();
    expect(createValidateFn(sample, {checkUnknowns: true})(memberKinds())).toBe(true);
    expect(JSON.parse(createJsonEncoderFn(sample)(memberKinds()) as string)).toEqual(memberKindsWire);
    const mutate = createJsonEncoderFn(sample, {strategy: 'mutate'});
    expect(JSON.parse(mutate(memberKinds()) as string)).toEqual(memberKindsWire);
  });
});

interface UserInterface {
  get id(): number;
  name: string;
}
type Fn<T> = (value: T) => unknown;
const wireUser = {id: 1, name: 'a'};

describe('class accessors — the same member through another shape', () => {
  const expectShape = <T>(isStrict: Fn<T>, mutate: Fn<T>, value: T, extra: T) => {
    expect(isStrict(value)).toBe(true);
    expect(isStrict(extra)).toBe(false);
    expect(JSON.parse(mutate(value) as string)).toEqual(wireUser);
  };
  const strict = {checkUnknowns: true} as const;
  const mutate = {strategy: 'mutate'} as const;

  it('an interface (static shape)', () => {
    expectShape(
      createValidateFn<UserInterface>(undefined, strict),
      createJsonEncoderFn<UserInterface>(undefined, mutate),
      new User(),
      new UserExtra()
    );
  });

  it('an interface (value shape)', () => {
    const sample: UserInterface = new User();
    expectShape(createValidateFn(sample, strict), createJsonEncoderFn(sample, mutate), new User(), new UserExtra());
  });

  it('Pick (static shape)', () => {
    type Picked = Pick<User, 'id' | 'name'>;
    expectShape(
      createValidateFn<Picked>(undefined, strict),
      createJsonEncoderFn<Picked>(undefined, mutate),
      new User(),
      new UserExtra()
    );
  });

  it('Pick (value shape)', () => {
    const sample: Pick<User, 'id' | 'name'> = new User();
    expectShape(createValidateFn(sample, strict), createJsonEncoderFn(sample, mutate), new User(), new UserExtra());
  });

  it('Partial (static shape)', () => {
    type Loose = Partial<User>;
    expectShape(
      createValidateFn<Loose>(undefined, strict),
      createJsonEncoderFn<Loose>(undefined, mutate),
      new User(),
      new UserExtra()
    );
  });

  it('Partial (value shape)', () => {
    const sample: Partial<User> = new User();
    expectShape(createValidateFn(sample, strict), createJsonEncoderFn(sample, mutate), new User(), new UserExtra());
  });

  it('an intersection (static shape)', () => {
    type Joined = User & {note?: string};
    expectShape(
      createValidateFn<Joined>(undefined, strict),
      createJsonEncoderFn<Joined>(undefined, mutate),
      new User(),
      new UserExtra()
    );
  });

  it('an intersection (value shape)', () => {
    const sample: User & {note?: string} = new User();
    expectShape(createValidateFn(sample, strict), createJsonEncoderFn(sample, mutate), new User(), new UserExtra());
  });

  it('DataOnly (static shape)', () => {
    type Data = DataOnly<User>;
    expectShape(
      createValidateFn<Data>(undefined, strict),
      createJsonEncoderFn<Data>(undefined, mutate),
      new User(),
      new UserExtra()
    );
  });

  it('DataOnly (value shape)', () => {
    const sample: DataOnly<User> = new User();
    expectShape(createValidateFn(sample, strict), createJsonEncoderFn(sample, mutate), new User(), new UserExtra());
  });
});

type DerivedShapes = {
  shaped: UserInterface;
  picked: Pick<User, 'id' | 'name'>;
  loose: Partial<User>;
  joined: User & {name: string};
  data: DataOnly<User>;
};
const derivedShapes = (user: () => User): DerivedShapes => ({
  shaped: user(),
  picked: user(),
  loose: user(),
  joined: user(),
  data: user(),
});
const derivedWire = {shaped: wireUser, picked: wireUser, loose: wireUser, joined: wireUser, data: wireUser};

describe('class accessors — other shapes one level deep', () => {
  it('pass strict, fail an extra key and encode (static shape)', () => {
    const isStrict = createValidateFn<DerivedShapes>(undefined, {checkUnknowns: true});
    expect(isStrict(derivedShapes(() => new User()))).toBe(true);
    expect(isStrict(derivedShapes(() => new UserExtra()))).toBe(false);
    const mutate = createJsonEncoderFn<DerivedShapes>(undefined, {strategy: 'mutate'});
    expect(JSON.parse(mutate(derivedShapes(() => new User())) as string)).toEqual(derivedWire);
  });

  it('pass strict, fail an extra key and encode (value shape)', () => {
    const sample = derivedShapes(() => new User());
    const isStrict = createValidateFn(sample, {checkUnknowns: true});
    expect(isStrict(derivedShapes(() => new User()))).toBe(true);
    expect(isStrict(derivedShapes(() => new UserExtra()))).toBe(false);
    const mutate = createJsonEncoderFn(sample, {strategy: 'mutate'});
    expect(JSON.parse(mutate(derivedShapes(() => new User())) as string)).toEqual(derivedWire);
  });
});

class Numbered {
  #id: number;
  constructor(id: number) {
    this.#id = id;
  }
  get id() {
    return this.#id;
  }
}

describe('class accessors — key formats read own keys', () => {
  type Sized = TF.FormattedObject<Pick<User, 'id' | 'name'>, {minProperties: 2}>;
  type Unique = TF.FormattedArray<Numbered[], {uniqueItems: true}>;

  it('minProperties and uniqueItems miss a getter (static shape)', () => {
    expect(createValidateFn<Sized>()(new User())).toBe(false);
    expect(createValidateFn<Unique>()([new Numbered(1), new Numbered(2)])).toBe(false);
  });

  it('minProperties and uniqueItems miss a getter (value shape)', () => {
    const sized: Sized = {id: 1, name: 'a'};
    const unique: Unique = [new Numbered(1)];
    expect(createValidateFn(sized)(new User())).toBe(false);
    expect(createValidateFn(unique)([new Numbered(1), new Numbered(2)])).toBe(false);
  });
});

class Documented {
  name = 'a';
  get id() {
    return 1;
  }
  set secret(_value: string) {
    throw new Error('never called');
  }
}

describe('class accessors — JSON schema and mock data', () => {
  const expectSchema = (doc: Record<string, unknown>) => {
    expect(Object.keys(doc.properties as object).sort()).toEqual(['id', 'name', 'secret']);
    expect(doc.required).toEqual(['name', 'id']);
    expect(doc.tsReadonly).toEqual(['id']);
  };

  it('a getter is required and readonly, a setter-only member optional (static shape)', () => {
    expectSchema(createJsonSchemaFn<Documented>()());
  });

  it('a getter is required and readonly, a setter-only member optional (value shape)', () => {
    expectSchema(createJsonSchemaFn(new Documented())());
  });

  it('a mock of a plain copy validates (static shape)', () => {
    type Copy = Pick<Documented, 'id' | 'name'>;
    expect(createValidateFn<Copy>()(createMockDataFn<Copy>()())).toBe(true);
  });

  it('a mock of a plain copy validates (value shape)', () => {
    const sample: Pick<Documented, 'id' | 'name'> = {id: 1, name: 'a'};
    expect(createValidateFn(sample)(createMockDataFn(sample)())).toBe(true);
  });
});

class Tree {
  name = 'n';
  get root(): Tree {
    return this;
  }
}

describe('class accessors — a getter that returns its own class', () => {
  it('is a recursive prop: it overflows, and rejectCircularRefs catches it (static shape)', () => {
    expect(() => createValidateFn<Tree>()(new Tree())).toThrow(RangeError);
    expect(createValidateFn<Tree>(undefined, {rejectCircularRefs: true})(new Tree())).toBe(false);
  });

  it('is a recursive prop: it overflows, and rejectCircularRefs catches it (value shape)', () => {
    const sample = new Tree();
    expect(() => createValidateFn(sample)(new Tree())).toThrow(RangeError);
    expect(createValidateFn(sample, {rejectCircularRefs: true})(new Tree())).toBe(false);
  });
});
