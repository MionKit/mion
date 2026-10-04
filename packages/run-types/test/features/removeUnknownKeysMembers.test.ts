// removeUnknownKeys returns `T`: every declared member is on the copy and works, is shared with the input with a
// notice, or the factory refuses. Each rule runs at the root and one level deeper, in both marker call shapes.

import {describe, expect, test} from 'vitest';
import {createRemoveUnknownKeysFn} from '@mionjs/run-types';

class Account {
  id = 1;
  onChange = (): number => this.id;
  constructor(public owner: string) {}
  get label(): string {
    return `${this.owner}#${this.id}`;
  }
  total(): number {
    return this.id * 10;
  }
}

class OnlyMethods {
  twice(n: number): number {
    return n * 2;
  }
}

class Scores {
  [player: string]: number | (() => number);
  best(): number {
    return 99;
  }
}

class Counter {
  #count = 0;
  label = 'clicks';
  bump(): number {
    return ++this.#count;
  }
}

let labelWrites = 0;
class Profile {
  first = 'ada';
  get label(): string {
    return this.first.toUpperCase();
  }
  set label(value: string) {
    labelWrites++;
    this.first = value;
  }
}

class Countdown {
  from = 2;
  *[Symbol.iterator](): Generator<number> {
    for (let n = this.from; n > 0; n--) yield n;
  }
}

class SymbolBag {
  [key: symbol]: string;
  name = 'bag';
  size(): number {
    return Object.getOwnPropertySymbols(this).length;
  }
}

interface Callable {
  (a: number): string;
  tag: string;
}

const tag = Symbol('tag');
interface Tagged {
  id: string;
  [tag]: string;
}

interface Button {
  label: string;
  onClick: () => string;
}

function makeAccount(): Account {
  return Object.assign(new Account('ada'), {extra: true});
}

function expectAccountCopy(copy: Account, input: Account): void {
  expect(copy).not.toBe(input);
  expect(copy).toBeInstanceOf(Account);
  expect(copy.owner).toBe('ada');
  expect(copy.total()).toBe(10);
  expect(copy.label).toBe('ada#1');
  expect(copy.onChange).toBe(input.onChange);
  expect('extra' in copy).toBe(false);
  expect(Object.keys(copy).sort()).toEqual(['id', 'onChange', 'owner']);
}

describe('removeUnknownKeys on class instances', () => {
  test('keeps the prototype, methods and accessors, and shares function fields, type form', () => {
    const input = makeAccount();
    expectAccountCopy(createRemoveUnknownKeysFn<Account>()(input), input);
  });

  test('keeps the prototype, methods and accessors, and shares function fields, value form', () => {
    const input = makeAccount();
    expectAccountCopy(createRemoveUnknownKeysFn(input)(input), input);
  });

  test('does the same one level deeper', () => {
    const input = makeAccount();
    const copy = createRemoveUnknownKeysFn<{account: Account}>()({account: input});
    expectAccountCopy(copy.account, input);
    const holder = {account: input};
    expectAccountCopy(createRemoveUnknownKeysFn(holder)(holder).account, input);
  });

  test('a class with only methods keeps its prototype', () => {
    const input = new OnlyMethods();
    const copy = createRemoveUnknownKeysFn<OnlyMethods>()(input);
    expect(copy).not.toBe(input);
    expect(copy.twice(2)).toBe(4);
    expect(createRemoveUnknownKeysFn(input)(input).twice(3)).toBe(6);
    expect(createRemoveUnknownKeysFn<{inner: OnlyMethods}>()({inner: input}).inner.twice(4)).toBe(8);
    const holder = {inner: input};
    expect(createRemoveUnknownKeysFn(holder)(holder).inner.twice(5)).toBe(10);
  });

  test('a class with an index signature keeps its prototype and its keys', () => {
    const input: Scores = Object.assign(new Scores(), {ada: 3, bob: 5});
    const copy = createRemoveUnknownKeysFn<Scores>()(input);
    expect(copy).toBeInstanceOf(Scores);
    expect(copy.best()).toBe(99);
    expect({...copy}).toEqual({ada: 3, bob: 5});
    expect(createRemoveUnknownKeysFn<{scores: Scores}>()({scores: input}).scores.best()).toBe(99);
    expect(createRemoveUnknownKeysFn(input)(input)).toBeInstanceOf(Scores);
    const holder = {scores: input};
    expect(createRemoveUnknownKeysFn(holder)(holder).scores.best()).toBe(99);
  });

  test('a get / set accessor stays on the prototype: the copy never runs the setter', () => {
    const input = new Profile();
    labelWrites = 0;
    const copy = createRemoveUnknownKeysFn<Profile>()(input);
    expect(copy).toBeInstanceOf(Profile);
    expect(copy.label).toBe('ADA');
    expect(Object.keys(copy)).toEqual(['first']);
    expect(createRemoveUnknownKeysFn(input)(input).label).toBe('ADA');
    const holder = {profile: input};
    expect(createRemoveUnknownKeysFn<{profile: Profile}>()(holder).profile.label).toBe('ADA');
    expect(createRemoveUnknownKeysFn(holder)(holder).profile.label).toBe('ADA');
    expect(labelWrites).toBe(0);
  });

  test('a symbol-keyed class method stays on the prototype, so the copy is still iterable', () => {
    const input = new Countdown();
    expect([...createRemoveUnknownKeysFn<Countdown>()(input)]).toEqual([2, 1]);
    expect([...createRemoveUnknownKeysFn(input)(input)]).toEqual([2, 1]);
    expect([...createRemoveUnknownKeysFn<{countdown: Countdown}>()({countdown: input}).countdown]).toEqual([2, 1]);
  });

  test('a class with a symbol index signature keeps its prototype and its symbol keys', () => {
    const input: SymbolBag = Object.assign(new SymbolBag(), {[tag]: 'x'});
    const copy = createRemoveUnknownKeysFn<SymbolBag>()(input);
    expect(copy).toBeInstanceOf(SymbolBag);
    expect(copy[tag]).toBe('x');
    expect(copy.size()).toBe(1);
    expect(createRemoveUnknownKeysFn(input)(input)[tag]).toBe('x');
  });

  test('a class with #private fields is refused, root and nested, both call shapes', () => {
    const counter = new Counter();
    // @mion-downgrade-error unknown-keys-private-fields
    expect(() => createRemoveUnknownKeysFn<Counter>()).toThrow(/unknown-keys-private-fields/);
    // @mion-downgrade-error unknown-keys-private-fields
    expect(() => createRemoveUnknownKeysFn(counter)).toThrow(/unknown-keys-private-fields/);
    // @mion-downgrade-error unknown-keys-private-fields
    expect(() => createRemoveUnknownKeysFn<{counter: Counter}>()).toThrow(/unknown-keys-private-fields/);
    const holder = {counter};
    // @mion-downgrade-error unknown-keys-private-fields
    expect(() => createRemoveUnknownKeysFn(holder)).toThrow(/unknown-keys-private-fields/);
  });
});

describe('removeUnknownKeys on symbol keys', () => {
  test('a declared symbol-keyed property is refused, root and nested, both call shapes', () => {
    const value: Tagged = {id: 'a', [tag]: 'x'};
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn<Tagged>()).toThrow(/unknown-keys-symbol-key/);
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn(value)).toThrow(/unknown-keys-symbol-key/);
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn<{inner: {id: string; [tag]: string}}>()).toThrow(/unknown-keys-symbol-key/);
    const holder = {inner: value};
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn(holder)).toThrow(/unknown-keys-symbol-key/);
  });

  test('an optional symbol-keyed property is refused too', () => {
    type Maybe = {id: string; [tag]?: string};
    const value: Maybe = {id: 'a'};
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn<Maybe>()).toThrow(/unknown-keys-symbol-key/);
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn(value)).toThrow(/unknown-keys-symbol-key/);
  });

  test('a symbol index signature copies every own symbol key', () => {
    type Bag = {name: string; [key: symbol]: {n: number}};
    const inner = {n: 1};
    const input: Bag = {name: 'bag', [tag]: inner};
    const copy = createRemoveUnknownKeysFn<Bag>()(input);
    expect(copy[tag]).toEqual({n: 1});
    expect(copy[tag]).not.toBe(inner);
    expect(createRemoveUnknownKeysFn(input)(input)[tag]).toEqual({n: 1});
    expect(createRemoveUnknownKeysFn<{bag: Bag}>()({bag: input}).bag[tag]).toEqual({n: 1});
    const holder = {bag: input};
    expect(createRemoveUnknownKeysFn(holder)(holder).bag[tag]).toEqual({n: 1});
  });

  test("a named symbol property with the signature's value type is copied by the signature", () => {
    type Bag = {[key: symbol]: {n: number}; [tag]: {n: number}};
    const inner = {n: 1, extra: true};
    const input: Bag = {[tag]: inner};
    const copy = createRemoveUnknownKeysFn<Bag>()(input);
    expect(copy[tag]).toEqual({n: 1});
    expect(copy[tag]).not.toBe(inner);
    expect(createRemoveUnknownKeysFn(input)(input)[tag]).toEqual({n: 1});
  });

  test('a named symbol property wider than the signature is refused: the signature would drop its members', () => {
    type Bag = {[key: symbol]: {n: number}; [tag]: {n: number; m: string}};
    const wide = {n: 1, m: 'kept?'};
    const input: Bag = {[tag]: wide};
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn<Bag>()).toThrow(/unknown-keys-symbol-key/);
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn(input)).toThrow(/unknown-keys-symbol-key/);
    // @mion-downgrade-error unknown-keys-symbol-key
    expect(() => createRemoveUnknownKeysFn<{bag: Bag}>()).toThrow(/unknown-keys-symbol-key/);
  });
});

describe('removeUnknownKeys on values it can only share', () => {
  const onClick = (): string => 'clicked';
  const button: Button = {label: 'ok', onClick};

  test('shares functions by default: properties, index signatures, arrays and the root', () => {
    expect(createRemoveUnknownKeysFn<Button>()(button).onClick).toBe(onClick);
    expect(createRemoveUnknownKeysFn(button)(button).onClick).toBe(onClick);
    expect(createRemoveUnknownKeysFn<{button: Button}>()({button}).button.onClick).toBe(onClick);
    const holder = {button};
    expect(createRemoveUnknownKeysFn(holder)(holder).button.onClick).toBe(onClick);
    expect(createRemoveUnknownKeysFn<Record<string, () => string>>()({a: onClick}).a).toBe(onClick);
    const list = [onClick];
    const listCopy = createRemoveUnknownKeysFn<Array<() => string>>()(list);
    expect(listCopy).not.toBe(list);
    expect(listCopy[0]).toBe(onClick);
    expect(createRemoveUnknownKeysFn<() => string>()(onClick)).toBe(onClick);
    const handles = {bytes: new Int8Array(2), pattern: /a/g};
    const handlesCopy = createRemoveUnknownKeysFn<{bytes: Int8Array; pattern: RegExp}>()(handles);
    expect(handlesCopy.bytes).toBe(handles.bytes);
    expect(handlesCopy.pattern).toBe(handles.pattern);
  });

  test('a callable interface is shared like any function, and refused under refuse', () => {
    const callable = Object.assign((a: number): string => String(a), {tag: 't'}) as Callable;
    expect(createRemoveUnknownKeysFn<Callable>()(callable)).toBe(callable);
    expect(createRemoveUnknownKeysFn(callable)(callable)).toBe(callable);
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<Callable>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn(callable, {sharedValues: 'refuse'})).toThrow(/unknown-keys-shared-value-refused/);
  });

  test('elements of arrays, tuples, Maps, Sets and unions are shared, with share and by default', () => {
    const pattern = /a/g;
    const map = new Map([['a', onClick]]);
    const mapCopy = createRemoveUnknownKeysFn<Map<string, () => string>>(undefined, {sharedValues: 'share'})(map);
    expect(mapCopy).not.toBe(map);
    expect(mapCopy.get('a')).toBe(onClick);
    const set = new Set([pattern]);
    expect([...createRemoveUnknownKeysFn<Set<RegExp>>(undefined, {sharedValues: 'share'})(set)][0]).toBe(pattern);
    expect([...createRemoveUnknownKeysFn(set, {sharedValues: 'share'})(set)][0]).toBe(pattern);
    const tuple: [() => string] = [onClick];
    expect(createRemoveUnknownKeysFn<[() => string]>(undefined, {sharedValues: 'share'})(tuple)[0]).toBe(onClick);
    expect(createRemoveUnknownKeysFn<string | (() => string)>()(onClick)).toBe(onClick);
    expect(createRemoveUnknownKeysFn<{pick: string | (() => string)}>()({pick: onClick}).pick).toBe(onClick);
  });

  test('elements of arrays, tuples, Maps, Sets and unions are refused under refuse', () => {
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<Map<string, () => string>>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<Set<RegExp>>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<[() => string]>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<string | (() => string)>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    const set = new Set([/a/]);
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn(set, {sharedValues: 'refuse'})).toThrow(/unknown-keys-shared-value-refused/);
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<{pick: string | (() => string)}>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
  });

  test('a Promise is shared under share', () => {
    const when = Promise.resolve(1);
    expect(createRemoveUnknownKeysFn<{when: Promise<number>}>(undefined, {sharedValues: 'share'})({when}).when).toBe(when);
    const holder = {when};
    expect(createRemoveUnknownKeysFn(holder, {sharedValues: 'share'})(holder).when).toBe(when);
  });

  test('sharedValues from a spread or const preset works like a literal', () => {
    const refusePreset = {sharedValues: 'refuse'} as const;
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<Button>(undefined, {...refusePreset})).toThrow(/unknown-keys-shared-value-refused/);
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<Button>(undefined, refusePreset)).toThrow(/unknown-keys-shared-value-refused/);
  });

  test("sharedValues: 'share' copies the same way", () => {
    expect(createRemoveUnknownKeysFn<Button>(undefined, {sharedValues: 'share'})(button).onClick).toBe(onClick);
    expect(createRemoveUnknownKeysFn(button, {sharedValues: 'share'})(button).onClick).toBe(onClick);
    const nested = createRemoveUnknownKeysFn<{button: Button}>(undefined, {sharedValues: 'share'});
    expect(nested({button}).button.onClick).toBe(onClick);
    const holder = {button};
    expect(createRemoveUnknownKeysFn(holder, {sharedValues: 'share'})(holder).button.onClick).toBe(onClick);
  });

  test("sharedValues: 'refuse' makes the factory throw, root and nested, both call shapes", () => {
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<Button>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn(button, {sharedValues: 'refuse'})).toThrow(/unknown-keys-shared-value-refused/);
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<{button: Button}>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<Array<() => string>>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn<{when: Promise<number>}>(undefined, {sharedValues: 'refuse'})).toThrow(
      /unknown-keys-shared-value-refused/
    );
    const holder = {button};
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn(holder, {sharedValues: 'refuse'})).toThrow(/unknown-keys-shared-value-refused/);
    const list = [onClick];
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn(list, {sharedValues: 'refuse'})).toThrow(/unknown-keys-shared-value-refused/);
    const waiting = {when: Promise.resolve(1)};
    // @mion-downgrade-error unknown-keys-shared-value-refused
    expect(() => createRemoveUnknownKeysFn(waiting, {sharedValues: 'refuse'})).toThrow(/unknown-keys-shared-value-refused/);
  });

  test("sharedValues: 'refuse' still copies plain data", () => {
    const refuse = createRemoveUnknownKeysFn<{id: number; tags: string[]}>(undefined, {sharedValues: 'refuse'});
    const input = {id: 1, tags: ['a'], extra: true};
    expect(refuse(input)).toEqual({id: 1, tags: ['a']});
  });
});
