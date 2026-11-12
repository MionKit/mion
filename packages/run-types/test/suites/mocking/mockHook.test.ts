// Covers both createMockDataFn call shapes (the marker coverage rule): the value-first schema and the static `<T>()`.

import {describe, expect, it} from 'vitest';
import {createMockDataFn, type MockNodeHook, type MockStep} from '@mionjs/run-types/mocking';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import type {RunType} from '@mionjs/run-types';
import {RunTypeKind} from '../../../src/go-generated/runTypeKind.generated.ts';
import '@mionjs/run-types/formats';

type Path = readonly string[];

/** A hook whose cursor is the step path from the root, so a test can address any node. **/
function pathHook(members: Omit<MockNodeHook<Path>, 'root' | 'descend'>, seen?: string[]): MockNodeHook<Path> {
  return {
    root: [],
    descend(cursor, step: MockStep) {
      const label =
        step.kind === 'property' ? `.${String(step.name)}` : step.kind === 'slot' ? `[${step.index}]` : `<${step.kind}>`;
      seen?.push(cursor.join('') + label);
      return [...cursor, label];
    },
    ...members,
  };
}

const at = (cursor: Path) => cursor.join('');

/** 'hooked' for a string node, nothing for any other. **/
const hookedString = (runType: RunType): {value: unknown} | undefined =>
  (runType.kind as number) === RunTypeKind.string ? {value: 'hooked'} : undefined;

interface User {
  name: string;
  age: number;
  tags: string[];
}

describe('mock hook', () => {
  it('without a hook, a seed produces the same value as without the option', () => {
    const schema = RT.object({name: TF.string(), list: RT.array(TF.number()), when: TF.date()});
    const plain = createMockDataFn(schema, {mock: {seed: 7}})();
    const noHook = createMockDataFn(schema, {mock: {seed: 7}, hook: undefined})();
    expect(noHook).toEqual(plain);
    expect(createMockDataFn<User>(undefined, {mock: {seed: 7}, hook: undefined})()).toEqual(
      createMockDataFn<User>(undefined, {mock: {seed: 7}})()
    );
  });

  it('a hook whose members return nothing leaves a seeded walk unchanged', () => {
    const schema = RT.object({name: TF.string(), list: RT.array(TF.number())});
    const hook = pathHook({value: () => undefined, bounds: () => undefined, length: () => undefined});
    expect(createMockDataFn(schema, {mock: {seed: 3}, hook})()).toEqual(createMockDataFn(schema, {mock: {seed: 3}})());
  });

  it('value short-circuits a leaf and a whole object, both call shapes', () => {
    const leaf = pathHook({value: (cursor) => (at(cursor) === '.name' ? {value: 'Ada'} : undefined)});
    const schemaUser = RT.object({name: TF.string(), age: TF.number(), tags: RT.array(TF.string())});
    expect((createMockDataFn(schemaUser, {hook: leaf})() as User).name).toBe('Ada');
    expect(createMockDataFn<User>(undefined, {hook: leaf})().name).toBe('Ada');

    const whole = pathHook({value: (cursor) => (at(cursor) === '' ? {value: {name: 'Bob', age: 1, tags: []}} : undefined)});
    expect(createMockDataFn(schemaUser, {hook: whole})()).toEqual({name: 'Bob', age: 1, tags: []});
    expect(createMockDataFn<User>(undefined, {hook: whole})()).toEqual({name: 'Bob', age: 1, tags: []});
  });

  it('a call-site hook replaces the factory one', () => {
    const factory = pathHook({value: (cursor) => (at(cursor) === '.name' ? {value: 'factory'} : undefined)});
    const call = pathHook({value: (cursor) => (at(cursor) === '.name' ? {value: 'call'} : undefined)});
    const mock = createMockDataFn<User>(undefined, {hook: factory});
    expect(mock().name).toBe('factory');
    expect(mock({hook: call}).name).toBe('call');
  });

  it('value inside a structural format: a rejected candidate is retried', () => {
    let calls = 0;
    const hook = pathHook({
      value: (cursor) => {
        if (at(cursor) !== '') return undefined;
        calls++;
        // The first candidate breaks minItems, the second satisfies it.
        return {value: calls === 1 ? [1] : [1, 2, 3]};
      },
    });
    const schema = RT.array(TF.number(), {minItems: 3});
    expect(createMockDataFn(schema, {hook})()).toEqual([1, 2, 3]);
    expect(calls).toBe(2);
  });

  it('bounds apply to an unbranded number and Date, never widen a format', () => {
    const hook = pathHook({
      bounds: (cursor) =>
        at(cursor) === '.when' ? {min: new Date('2001-01-01'), max: new Date('2001-01-02')} : {min: 100, max: 101},
    });
    for (let i = 0; i < 20; i++) {
      const value = createMockDataFn<{n: number; when: Date}>(undefined, {hook})();
      expect(value.n).toBeGreaterThanOrEqual(100);
      expect(value.n).toBeLessThanOrEqual(101);
      expect(value.when.getTime()).toBeGreaterThanOrEqual(Date.parse('2001-01-01'));
      expect(value.when.getTime()).toBeLessThanOrEqual(Date.parse('2001-01-02'));
      const formatted = createMockDataFn(
        RT.object({n: TF.number({min: 0, max: 5}), when: TF.date({min: '2020-01-01T00:00:00', max: '2020-01-02T00:00:00'})}),
        {
          hook,
        }
      )() as {n: number; when: Date};
      expect(formatted.n).toBeLessThanOrEqual(5);
      expect(formatted.when.getTime()).toBeLessThanOrEqual(Date.parse('2020-01-03'));
    }
  });

  it('length sets an array count before a formattedArray clamp', () => {
    const hook = pathHook({length: () => 4});
    expect(createMockDataFn(RT.array(TF.number()), {hook})()).toHaveLength(4);
    expect(createMockDataFn<number[]>(undefined, {hook})()).toHaveLength(4);
    expect(createMockDataFn(RT.array(TF.number(), {maxItems: 2}), {hook})()).toHaveLength(2);
  });

  it('descend names every step: property, item, slot, rest tuple, mapKey / mapValue / setValue', () => {
    const seen: string[] = [];
    const hook = pathHook({length: () => 1}, seen);
    const schema = RT.object({
      list: RT.array(TF.number()),
      pair: RT.tuple({required: [TF.string(), TF.number()]}),
      rest: RT.tuple({required: [TF.string()], rest: TF.number()}),
      map: RT.map(TF.string(), TF.number(), {minItems: 1}),
      set: RT.set(TF.string(), {minItems: 1}),
    });
    createMockDataFn(schema, {hook})();
    expect(seen).toEqual(
      expect.arrayContaining([
        '.list',
        '.list<item>',
        '.pair',
        '.pair[0]',
        '.pair[1]',
        '.rest[0]',
        '.rest[1]',
        '.map<mapKey>',
        '.map<mapValue>',
        '.set<setValue>',
      ])
    );
    const staticSeen: string[] = [];
    createMockDataFn<{list: number[]; pair: [string, number]}>(undefined, {hook: pathHook({length: () => 1}, staticSeen)})();
    expect(staticSeen).toEqual(expect.arrayContaining(['.list', '.list<item>', '.pair[0]', '.pair[1]']));
  });

  it('an undefined descend detaches the hook below that node', () => {
    let calls = 0;
    const hook: MockNodeHook<string> = {
      root: '',
      descend: (cursor, step) => (step.kind === 'property' && step.name === 'inner' ? undefined : `${cursor}.${step.kind}`),
      value: (cursor, node) => {
        calls++;
        return cursor === '' ? undefined : hookedString(node.runType);
      },
    };
    const value = createMockDataFn(RT.object({a: TF.string(), inner: RT.object({b: TF.string()})}), {hook})() as {
      a: string;
      inner: {b: string};
    };
    expect(value.a).toBe('hooked');
    expect(value.inner.b).not.toBe('hooked');
    expect(calls).toBe(2); // the root object and `a`, nothing under `inner`
  });

  it('node.generate honours minLength / maxLength', () => {
    const hook = pathHook({
      value: (cursor, node) =>
        at(cursor) === '.name' ? {value: node.generate('firstName', {minLength: 3, maxLength: 4})} : undefined,
    });
    for (let i = 0; i < 20; i++) {
      const name = createMockDataFn<{name: string}>(undefined, {hook})().name;
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(4);
    }
  });
});
