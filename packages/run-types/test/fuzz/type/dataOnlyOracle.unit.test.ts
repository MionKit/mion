// Negative controls for D4: each check fires on a disagreement between T and DataOnly<T> and stays quiet on agreement.

import {describe, expect, it} from 'vitest';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';
import {
  checkDataOnlyAnswers,
  checkDataOnlyMembers,
  checkDataOnlyRoot,
  dataOnlyView,
  memberMismatches,
  mutationsOf,
} from './dataOnlyOracle.ts';

const ctx = {target: 'T', seed: 1, source: 'type T = …'};
const noRefs = () => undefined;

function node(kind: number, extra: Partial<RunType> = {}): RunType {
  return {id: `${kind}-${Math.random()}`, kind, ...extra} as RunType;
}
function prop(name: string, child: RunType, extra: Partial<RunType> = {}): RunType {
  return node(RunTypeKind.propertySignature, {name, child, ...extra});
}
function object(...children: RunType[]): RunType {
  return node(RunTypeKind.objectLiteral, {children});
}

describe('dataOnlyOracle', () => {
  it('root: fires when DataOnly<T> is never but T validates', () => {
    expect(checkDataOnlyRoot(RunTypeKind.symbol, RunTypeKind.never, false, ctx)?.oracle).toBe('D4');
    expect(checkDataOnlyRoot(RunTypeKind.symbol, RunTypeKind.never, true, ctx)).toBeNull();
    expect(checkDataOnlyRoot(RunTypeKind.never, RunTypeKind.never, false, ctx)).toBeNull();
    expect(checkDataOnlyRoot(RunTypeKind.objectLiteral, RunTypeKind.objectLiteral, false, ctx)).toBeNull();
  });

  it('answers: fires on the first sample the validators disagree on', () => {
    const samples = [
      {label: 'mock', value: {a: 1}},
      {label: 'mock with a removed', value: {}},
    ];
    const strict = (value: unknown) => 'a' in (value as object);
    expect(checkDataOnlyAnswers(samples, strict, () => true, ctx)?.message).toContain('mock with a removed');
    expect(checkDataOnlyAnswers(samples, strict, strict, ctx)).toBeNull();
    expect(
      checkDataOnlyAnswers(
        samples,
        () => 'throws',
        () => false,
        ctx
      )?.oracle
    ).toBe('D4');
  });

  it('members: fires on a member stripped on one side only', () => {
    const str = node(RunTypeKind.string);
    const fn = node(RunTypeKind.function, {notSupported: true});
    const sym = node(RunTypeKind.symbol, {notSupported: true});
    const type = object(prop('a', str), prop('f', fn), prop('s', sym));
    expect(checkDataOnlyMembers(type, object(prop('a', str)), noRefs, ctx)).toBeNull();
    // A symbol DataOnly kept, or a function the Go side kept: both are drift.
    expect(checkDataOnlyMembers(type, object(prop('a', str), prop('s', str)), noRefs, ctx)?.oracle).toBe('D4');
    const keptByGo = object(prop('a', str), prop('f', str));
    expect(memberMismatches(keptByGo, object(prop('a', str)), noRefs)).toEqual(['$.f is kept in T but dropped by DataOnly<T>']);
  });

  it('members: compares optional flags and walks nested objects, arrays and class shapes', () => {
    const str = node(RunTypeKind.string);
    const optional = object(prop('a', str, {optional: true}));
    expect(memberMismatches(optional, object(prop('a', str)), noRefs)).toEqual(['$.a is optional in T but not in DataOnly<T>']);
    const nestedType = object(prop('list', node(RunTypeKind.array, {child: object(prop('x', str), prop('y', str))})));
    const nestedDataOnly = object(prop('list', node(RunTypeKind.array, {child: object(prop('x', str))})));
    expect(memberMismatches(nestedType, nestedDataOnly, noRefs)).toEqual(['$.list[].y is kept in T but dropped by DataOnly<T>']);
    const userClass = node(RunTypeKind.class, {subKind: RunTypeSubKind.none, children: [prop('x', str)]});
    expect(memberMismatches(userClass, object(prop('x', str)), noRefs)).toEqual([]);
  });

  it('members: a kept native stays that native, while a projected one fires', () => {
    const url = () => node(RunTypeKind.class, {subKind: RunTypeSubKind.url, typeName: 'URL'});
    expect(memberMismatches(object(prop('link', url())), object(prop('link', url())), noRefs)).toEqual([]);
    expect(
      memberMismatches(object(prop('link', url())), object(prop('link', object(prop('href', node(RunTypeKind.string))))), noRefs)
    ).toEqual(['$.link: the native URL in T is kind objectLiteral in DataOnly<T>']);
    const date = node(RunTypeKind.class, {subKind: RunTypeSubKind.date, typeName: 'Date'});
    expect(memberMismatches(date, url(), noRefs)).toEqual(['$: the native Date in T is kind class in DataOnly<T>']);
  });

  it('view: removes the members DataOnly<T> drops, down kept members, index values and arrays', () => {
    const str = node(RunTypeKind.string);
    const regexp = node(RunTypeKind.class, {subKind: RunTypeSubKind.nonSerializable, notSupported: true});
    const index = (child: RunType) => node(RunTypeKind.indexSignature, {index: node(RunTypeKind.number), child});
    const inner = object(prop('x', str), prop('re', regexp, {optional: true}));
    const type = object(
      prop('re', regexp, {optional: true}),
      prop('list', node(RunTypeKind.array, {child: inner})),
      index(object(prop('re', regexp)))
    );
    const dataOnly = object(prop('list', node(RunTypeKind.array, {child: object(prop('x', str))})), index(object()));
    const value = {re: /a/, list: [{x: 'a', re: /b/}], 0: {re: /c/}};
    expect(dataOnlyView(value, type, dataOnly, noRefs)).toEqual({list: [{x: 'a'}], 0: {}});
    expect(value.re).toEqual(/a/);
  });

  it('view: removes a function-typed member, which reflects as a method, beside an index signature', () => {
    const fn = node(RunTypeKind.methodSignature, {name: 'fn', notSupported: true});
    const index = node(RunTypeKind.indexSignature, {index: node(RunTypeKind.number), child: node(RunTypeKind.null)});
    const type = object(fn, prop('url', node(RunTypeKind.string), {optional: true}), index);
    const dataOnly = object(prop('url', node(RunTypeKind.string), {optional: true}), index);
    expect(dataOnlyView({fn: () => 1, url: 'u', 0: null}, type, dataOnly, noRefs)).toEqual({url: 'u', 0: null});
  });

  it('view: walks tuple slots and every index signature of a multi-key index', () => {
    const str = node(RunTypeKind.string);
    const regexp = node(RunTypeKind.class, {subKind: RunTypeSubKind.nonSerializable, notSupported: true});
    const tuple = (child: RunType) => node(RunTypeKind.tuple, {children: [node(RunTypeKind.tupleMember, {child})]});
    const withRe = object(prop('x', str), prop('re', regexp, {optional: true}));
    expect(dataOnlyView([{x: 'a', re: /a/}], tuple(withRe), tuple(object(prop('x', str))), noRefs)).toEqual([{x: 'a'}]);
    const index = (key: number, child: RunType) => node(RunTypeKind.indexSignature, {index: node(key), child});
    const type = object(index(RunTypeKind.string, withRe), index(RunTypeKind.number, withRe));
    const dataOnly = object(index(RunTypeKind.string, object(prop('x', str))), index(RunTypeKind.number, object(prop('x', str))));
    expect(dataOnlyView({a: {x: 'a', re: /a/}, 0: {x: 'b', re: /b/}}, type, dataOnly, noRefs)).toEqual({
      a: {x: 'a'},
      0: {x: 'b'},
    });
  });

  it('mutates by removing and mistyping each member down a few levels', () => {
    const labels = mutationsOf({a: 1, nested: {b: 'x'}}).map((mutation) => mutation.label);
    expect(labels).toEqual([
      'mock with a removed',
      'mock with a wrong-typed',
      'mock with nested removed',
      'mock with nested wrong-typed',
      'mock with nested.b removed',
      'mock with nested.b wrong-typed',
    ]);
    const original = {a: 1};
    expect(mutationsOf(original)[0].value).toEqual({});
    expect(original).toEqual({a: 1});
  });
});
