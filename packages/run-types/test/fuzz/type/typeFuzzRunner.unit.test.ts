// Offline unit tests for the mock lane's O14 strategy-agreement probe and the compactNullRisk gate that skips O12.

import {describe, it, expect} from 'vitest';
import {probeStrategies} from './typeFuzzRunner.ts';
import {compactNullRisk} from '../roundtrip/roundtripOracle.ts';
import type {FuzzTarget, Violation} from '../value/fuzzOracle.ts';
import type {GeneratedType, TypeShape} from '../core/typeGen.ts';

const base = {target: 'stub', seed: 1, phase: 'valid' as const, value: '{}'};

const serializes = (): string => '{}';
const alwaysThrows = (): never => {
  throw new Error('[validate-symbol-root] not serialisable');
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
const nullNumberOrBoolean: TypeShape = {kind: 'union', members: [{kind: 'null'}, {kind: 'number'}, {kind: 'boolean'}]};

describe('compactNullRisk', () => {
  it('is false for `{p?: null | number}`: `false` marks absent', () => {
    expect(compactNullRisk(objectWithProp(true, nullOrNumber))).toBe(false);
  });

  it('is false for `{p?: null | string}`: `0` marks absent', () => {
    expect(compactNullRisk(objectWithProp(true, {kind: 'union', members: [{kind: 'null'}, {kind: 'string'}]}))).toBe(false);
  });

  it('is true for `{p?: null | number | boolean}` and `{p?: unknown}`: no free placeholder', () => {
    expect(compactNullRisk(objectWithProp(true, nullNumberOrBoolean))).toBe(true);
    expect(compactNullRisk(objectWithProp(true, {kind: 'unknown'}))).toBe(true);
  });

  it('is true when the at-risk optional sits behind a named alias', () => {
    const gen: GeneratedType = {
      decls: [{kind: 'type', name: 'N', shape: nullNumberOrBoolean}],
      root: {kind: 'array', elem: objectWithProp(true, {kind: 'ref', name: 'N'}).root},
    };
    expect(compactNullRisk(gen)).toBe(true);
  });

  it('is true when union members share a slot whose wire values cover all three', () => {
    const member = (shape: TypeShape) => objectWithProp(true, shape).root;
    const gen: GeneratedType = {decls: [], root: {kind: 'union', members: [member(nullOrNumber), member({kind: 'boolean'})]}};
    expect(compactNullRisk(gen)).toBe(true);
  });

  it('is false for `{p?: number}`', () => {
    expect(compactNullRisk(objectWithProp(true, {kind: 'number'}))).toBe(false);
  });

  it('is false for a required `{p: unknown}`', () => {
    expect(compactNullRisk(objectWithProp(false, {kind: 'unknown'}))).toBe(false);
  });
});
