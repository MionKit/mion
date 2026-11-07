// Every error must own its path array: the walk reuses one live path list for every check.

import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createGetValidationErrorsFn, overrideGetValidationErrors, type RTValidationError} from '@mionjs/run-types';

interface Tree {
  value: number;
  children: Tree[];
}
interface User {
  name: string;
  age: number;
}
interface Box {
  user: User;
  list: User[];
  map: Map<string, User>;
  set: Set<User>;
}
interface Contact {
  email: TF.String<{maxLength: 5}>;
}
interface Person {
  contacts: Contact[];
}
// Branded so its override applies to this type only.
type Stored = {readonly __brand: 'validationErrorPathsOverride'; a: number};
interface Holder {
  items: Stored[];
}

// Keeps the path it is handed inside its error, as user code may.
overrideGetValidationErrors<Stored>((value, path = [], errors = []) => {
  if ((value as {a?: unknown} | null)?.a !== 1) errors.push({path, expected: 'stored'} as never);
  return errors;
});

const badTree = {
  value: 1,
  children: [
    {value: 'x', children: []},
    {value: 2, children: 'no'},
  ],
};
const treeErrors = [
  {expected: 'number', path: ['children', 0, 'value']},
  {expected: 'array', path: ['children', 1, 'children']},
];
const badBox = {
  user: {name: 1, age: 1},
  list: [
    {name: 'a', age: 1},
    {name: 'b', age: 'x'},
  ],
  map: new Map([['k', {name: 'c', age: 'y'}]]),
  set: new Set([{name: 2, age: 1}]),
};

function expectOwnPaths(errors: RTValidationError[], callerPath?: unknown[]) {
  const paths = new Set(errors.map((error) => error.path));
  expect(paths.size).toBe(errors.length);
  if (callerPath) expect(paths.has(callerPath as RTValidationError['path'])).toBe(false);
}

describe('getValidationErrors paths', () => {
  it('reports recursive paths through pushed segments (static)', () => {
    const getErrors = createGetValidationErrorsFn<Tree>();
    const errors = getErrors(badTree);
    expect(errors).toEqual(treeErrors);
    expectOwnPaths(errors);
  });

  it('reports recursive paths through pushed segments (reflection)', () => {
    const tree: Tree = {value: 1, children: []};
    const getErrors = createGetValidationErrorsFn(tree);
    const errors = getErrors(badTree);
    expect(errors).toEqual(treeErrors);
    expectOwnPaths(errors);
  });

  it('reports nested named types, arrays, Map values and Set items', () => {
    const errors = createGetValidationErrorsFn<Box>()(badBox);
    expect(errors).toEqual([
      {expected: 'string', path: ['user', 'name']},
      {expected: 'number', path: ['list', 1, 'age']},
      {expected: 'number', path: ['map', {key: 0, failed: 'mapValue'}, 'age']},
      {expected: 'string', path: ['set', {key: 0, failed: 'setKey'}, 'name']},
    ]);
    expectOwnPaths(errors);
  });

  it('reports strict unknown keys under a pushed path', () => {
    const getErrors = createGetValidationErrorsFn<Box>(undefined, {checkUnknowns: true});
    const errors = getErrors({user: {name: 'a', age: 1}, list: [{name: 'b', age: 2, extra: 1}], map: new Map(), set: new Set()});
    expect(errors).toEqual([{expected: 'never', path: ['list', 0, 'extra']}]);
    expectOwnPaths(errors);
  });

  it('reports a format failure at a nested position', () => {
    const errors = createGetValidationErrorsFn<Person>()({contacts: [{email: 'abc'}, {email: 'toolong'}, {email: 'abcdefg'}]});
    expect(errors.map((error) => error.path)).toEqual([
      ['contacts', 1, 'email'],
      ['contacts', 2, 'email'],
    ]);
    expect(errors[0].format?.name).toBe('stringFormat');
    expectOwnPaths(errors);
  });

  it('reports a cycle at its path', () => {
    interface Node {
      name: string;
      next?: Node;
    }
    const getErrors = createGetValidationErrorsFn<Node>(undefined, {rejectCircularRefs: true});
    const node: Node = {name: 'a'};
    node.next = {name: 'b', next: node};
    const errors = getErrors(node);
    expect(errors).toEqual([{expected: 'circular', path: ['next', 'next']}]);
  });

  it('prefixes a caller path without mutating or aliasing it', () => {
    const getErrors = createGetValidationErrorsFn<Tree>();
    const callerPath = ['root'];
    const callerErrors: RTValidationError[] = [];
    const errors = getErrors(badTree, callerPath, callerErrors);
    expect(errors).toBe(callerErrors);
    expect(callerPath).toEqual(['root']);
    expect(errors.map((error) => error.path)).toEqual(treeErrors.map((error) => ['root', ...error.path]));
    expectOwnPaths(errors, callerPath);

    const pathOnly = getErrors(badTree, callerPath);
    expect(pathOnly.map((error) => error.path)).toEqual(treeErrors.map((error) => ['root', ...error.path]));
    expect(callerPath).toEqual(['root']);
    expectOwnPaths(pathOnly, callerPath);
  });

  it('returns no errors for a valid value with only a caller path (static)', () => {
    const callerPath = ['root'];
    expect(createGetValidationErrorsFn<Tree>()({value: 1, children: []}, callerPath)).toEqual([]);
    expect(callerPath).toEqual(['root']);
  });

  it('returns no errors for a valid value with only a caller path (reflection)', () => {
    const tree: Tree = {value: 1, children: []};
    expect(createGetValidationErrorsFn(tree)({value: 2, children: [tree]}, ['root'])).toEqual([]);
  });

  it('fills a missing path when only errors are passed', () => {
    const getErrors = createGetValidationErrorsFn<Tree>();
    const own: RTValidationError[] = [];
    expect(getErrors(badTree, undefined, own)).toBe(own);
    expect(own).toEqual(treeErrors);
  });

  it('gives errors from the same check their own path arrays', () => {
    const errors = createGetValidationErrorsFn<number[]>()(['a', 'b']);
    expect(errors).toEqual([
      {expected: 'number', path: [0]},
      {expected: 'number', path: [1]},
    ]);
    expectOwnPaths(errors);
  });

  it('hands a nested override its own path array', () => {
    const getErrors = createGetValidationErrorsFn<Holder>();
    const first = getErrors({items: [{a: 1}, {a: 2}]});
    expect(first).toEqual([{expected: 'stored', path: ['items', 1]}]);
    getErrors({items: [{a: 3}, {a: 1}, {a: 4}]});
    expect(getErrors(badTree as never)).toEqual([{expected: 'array', path: ['items']}]);
    expect(first).toEqual([{expected: 'stored', path: ['items', 1]}]);
  });
});
