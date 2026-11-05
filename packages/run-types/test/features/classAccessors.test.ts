// A class getter or setter behaves like any other prop in every function, though JS does not list it as a key.

import {afterEach, describe, expect, it} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import '@mionjs/run-types/formats';
import {
  createFormatTransformFn,
  createGetValidationErrorsFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createRemoveUnknownKeysFn,
  createValidateFn,
  type DataOnly,
} from '@mionjs/run-types';
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
});

describe('class accessors — removeUnknownKeys', () => {
  it('drops an extra key and keeps the getter (static shape)', () => {
    const result = createRemoveUnknownKeysFn<User>()(new UserExtra());
    expect([Object.keys(result), result.id]).toEqual([['name'], 1]);
  });

  it('drops an extra key and keeps the getter (value shape)', () => {
    const result = createRemoveUnknownKeysFn(new User())(new UserExtra());
    expect([Object.keys(result), result.id]).toEqual([['name'], 1]);
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
  #n = '1';
  get n(): string {
    return this.#n;
  }
  set n(value: number) {
    this.#n = String(value);
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

  it('mixed get and set types carry the read type, and a rebuild skips it (static shape)', () => {
    registerClassSerializer(Mixed, {});
    expect(JSON.parse(createJsonEncoderFn<Mixed>()(new Mixed()) as string)).toEqual({n: '1', name: 'a'});
    expect(createJsonDecoderFn<Mixed>()('{"n":"9","name":"b"}').n).toBe('1');
    expect(createValidateFn<Mixed>()(new Mixed())).toBe(true);
  });

  it('mixed get and set types carry the read type, and a rebuild skips it (value shape)', () => {
    registerClassSerializer(Mixed, {});
    const sample = new Mixed();
    expect(JSON.parse(createJsonEncoderFn(sample)(new Mixed()) as string)).toEqual({n: '1', name: 'a'});
    expect(createJsonDecoderFn(sample)('{"n":"9","name":"b"}').n).toBe('1');
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
