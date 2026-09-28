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
  });

  test('a class with an index signature keeps its prototype and its keys', () => {
    const input = Object.assign(new Scores(), {ada: 3, bob: 5});
    const copy = createRemoveUnknownKeysFn<Scores>()(input);
    expect(copy).toBeInstanceOf(Scores);
    expect(copy.best()).toBe(99);
    expect({...copy}).toEqual({ada: 3, bob: 5});
    expect(createRemoveUnknownKeysFn<{scores: Scores}>()({scores: input}).scores.best()).toBe(99);
  });

  test('a class with #private fields is refused, root and nested, both call shapes', () => {
    const counter = new Counter();
    // @mion-downgrade-error RUK005
    expect(() => createRemoveUnknownKeysFn<Counter>()).toThrow(/RUK005/);
    // @mion-downgrade-error RUK005
    expect(() => createRemoveUnknownKeysFn(counter)).toThrow(/RUK005/);
    // @mion-downgrade-error RUK005
    expect(() => createRemoveUnknownKeysFn<{counter: Counter}>()).toThrow(/RUK005/);
    const holder = {counter};
    // @mion-downgrade-error RUK005
    expect(() => createRemoveUnknownKeysFn(holder)).toThrow(/RUK005/);
  });
});

describe('removeUnknownKeys on symbol keys', () => {
  test('a declared symbol-keyed property is refused, root and nested, both call shapes', () => {
    const value: Tagged = {id: 'a', [tag]: 'x'};
    // @mion-downgrade-error RUK004
    expect(() => createRemoveUnknownKeysFn<Tagged>()).toThrow(/RUK004/);
    // @mion-downgrade-error RUK004
    expect(() => createRemoveUnknownKeysFn(value)).toThrow(/RUK004/);
    // @mion-downgrade-error RUK004
    expect(() => createRemoveUnknownKeysFn<{inner: {id: string; [tag]: string}}>()).toThrow(/RUK004/);
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
  });
});

describe('removeUnknownKeys on values it can only share', () => {
  const onClick = (): string => 'clicked';
  const button: Button = {label: 'ok', onClick};

  test('shares functions by default: properties, index signatures, arrays and the root', () => {
    expect(createRemoveUnknownKeysFn<Button>()(button).onClick).toBe(onClick);
    expect(createRemoveUnknownKeysFn(button)(button).onClick).toBe(onClick);
    expect(createRemoveUnknownKeysFn<{button: Button}>()({button}).button.onClick).toBe(onClick);
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

  test("sharedValues: 'share' copies the same way", () => {
    expect(createRemoveUnknownKeysFn<Button>(undefined, {sharedValues: 'share'})(button).onClick).toBe(onClick);
    expect(createRemoveUnknownKeysFn(button, {sharedValues: 'share'})(button).onClick).toBe(onClick);
    const nested = createRemoveUnknownKeysFn<{button: Button}>(undefined, {sharedValues: 'share'});
    expect(nested({button}).button.onClick).toBe(onClick);
  });

  test("sharedValues: 'refuse' makes the factory throw, root and nested, both call shapes", () => {
    // @mion-downgrade-error RUK006
    expect(() => createRemoveUnknownKeysFn<Button>(undefined, {sharedValues: 'refuse'})).toThrow(/RUK006/);
    // @mion-downgrade-error RUK006
    expect(() => createRemoveUnknownKeysFn(button, {sharedValues: 'refuse'})).toThrow(/RUK006/);
    // @mion-downgrade-error RUK006
    expect(() => createRemoveUnknownKeysFn<{button: Button}>(undefined, {sharedValues: 'refuse'})).toThrow(/RUK006/);
    // @mion-downgrade-error RUK006
    expect(() => createRemoveUnknownKeysFn<Array<() => string>>(undefined, {sharedValues: 'refuse'})).toThrow(/RUK006/);
    // @mion-downgrade-error RUK006
    expect(() => createRemoveUnknownKeysFn<{when: Promise<number>}>(undefined, {sharedValues: 'refuse'})).toThrow(/RUK006/);
  });

  test("sharedValues: 'refuse' still copies plain data", () => {
    const refuse = createRemoveUnknownKeysFn<{id: number; tags: string[]}>(undefined, {sharedValues: 'refuse'});
    const input = {id: 1, tags: ['a'], extra: true};
    expect(refuse(input)).toEqual({id: 1, tags: ['a']});
  });
});
