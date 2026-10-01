// Negative controls for D4: each check fires on a disagreement between T and DataOnly<T> and stays quiet on agreement.

import {describe, expect, it} from 'vitest';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';
import {checkDataOnlyAnswers, checkDataOnlyMembers, checkDataOnlyRoot, memberMismatches, mutationsOf} from './dataOnlyOracle.ts';

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
