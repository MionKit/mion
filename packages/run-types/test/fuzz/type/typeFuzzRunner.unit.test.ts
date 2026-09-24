// Offline unit tests for the mock lane's O14 strategy-agreement probe and the compactNullRisk gate that skips O12.

import {describe, it, expect} from 'vitest';
import {probeStrategies} from './typeFuzzRunner.ts';
import {compactNullRisk} from '../roundtrip/roundtripOracle.ts';
import type {FuzzTarget, Violation} from '../value/fuzzOracle.ts';
import type {GeneratedType, TypeShape} from '../core/typeGen.ts';

const base = {target: 'stub', seed: 1, phase: 'valid' as const, value: '{}'};

const serializes = (): string => '{}';
const alwaysThrows = (): never => {
  throw new Error('[RT001] not serialisable');
};
const crashes = (): never => {
  throw new TypeError('boom');
};

function targetWith(jsonEncode: () => string, compactEncode: () => string): FuzzTarget {
  return {
    title: 'stub',
    schema: {} as never,
    mock: () => ({}),
    validate: () => true,
    getValidationErrors: () => [],
    jsonEncode,
    compactEncode,
  };
}

function probe(jsonEncode: () => string, compactEncode: () => string): {serialized: boolean | undefined; oracles: string[]} {
  const out: Violation[] = [];
  const serialized = probeStrategies(targetWith(jsonEncode, compactEncode), {}, base, out);
  return {serialized, oracles: out.map((violation) => violation.oracle)};
}

describe('O14 serialize-vs-fail agreement', () => {
  it('is quiet when both encoders serialize', () => {
    expect(probe(serializes, serializes)).toEqual({serialized: true, oracles: []});
  });

  it('is quiet when both encoders alwaysThrow', () => {
    expect(probe(alwaysThrows, alwaysThrows)).toEqual({serialized: false, oracles: []});
  });

  it('reports compact alwaysThrowing where json serializes', () => {
    expect(probe(serializes, alwaysThrows)).toEqual({serialized: undefined, oracles: ['O14']});
  });

  it('reports json alwaysThrowing where compact serializes', () => {
    expect(probe(alwaysThrows, serializes)).toEqual({serialized: undefined, oracles: ['O14']});
  });

  it('reports an uncontrolled throw as O7 on top of the disagreement', () => {
    expect(probe(serializes, crashes)).toEqual({serialized: undefined, oracles: ['O7', 'O14']});
  });
});

function objectWithProp(optional: boolean, shape: TypeShape): GeneratedType {
  return {decls: [], root: {kind: 'object', props: [{name: 'p', optional, readonly: false, method: false, shape}]}};
}

const nullOrNumber: TypeShape = {kind: 'union', members: [{kind: 'null'}, {kind: 'number'}]};

describe('compactNullRisk', () => {
  it('is true for `{p?: null | number}`', () => {
    expect(compactNullRisk(objectWithProp(true, nullOrNumber))).toBe(true);
  });

  it('is true when the nullable optional sits behind a named alias', () => {
    const gen: GeneratedType = {
      decls: [{kind: 'type', name: 'N', shape: nullOrNumber}],
      root: {kind: 'array', elem: objectWithProp(true, {kind: 'ref', name: 'N'}).root},
    };
    expect(compactNullRisk(gen)).toBe(true);
  });

  it('is false for `{p?: number}`', () => {
    expect(compactNullRisk(objectWithProp(true, {kind: 'number'}))).toBe(false);
  });

  it('is false for a required `{p: null | number}`', () => {
    expect(compactNullRisk(objectWithProp(false, nullOrNumber))).toBe(false);
  });
});
