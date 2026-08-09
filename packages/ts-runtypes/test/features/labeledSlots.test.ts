// Labeled slot builders — `RT.tuple([RT.slot('x', …)])` names tuple slots,
// `RT.func([RT.slot('event', …)], ret)` names function parameters. Labels ride
// the `__rtLabels` sentinel on the carried type and fold into the structural
// id, so the slot forms CONVERGE with their labeled type-first twins (one
// cache entry — pinned via factory reference identity and both `getRunTypeId`
// call shapes), while the plain array forms keep modeling the unlabeled
// shapes. Slots are an ARRAY on purpose: object keys cannot carry order (the
// checker sorts keyof unions by internal type id, not declaration order).

import * as TF from '@ts-runtypes/core/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

describe('labeled slot builders', () => {
  it('tuple slot form converges with the labeled type-first tuple — both getRunTypeId shapes', () => {
    // Reflect shape: the id of the type the builder value models.
    const fromBuilder = getRunTypeId(RT.tuple([RT.slot('name', TF.string()), RT.slot('age', TF.number())]));
    // Static shape: caller supplies T.
    const fromType = getRunTypeId<[name: string, age: number]>();
    expect(fromBuilder).toBe(fromType);
    // The unlabeled array form stays a DISTINCT entry (labels are id data).
    expect(getRunTypeId(RT.tuple([TF.string(), TF.number()]))).not.toBe(fromType);
  });

  it('resolves the same cached validator factory as the type-first form', () => {
    const fromSchema = createValidateFn(RT.tuple([RT.slot('name', TF.string()), RT.slot('age', TF.number())]));
    const fromType = createValidateFn<[name: string, age: number]>();
    expect(fromSchema).toBe(fromType);
    expect(fromSchema(['Alice', 30])).toBe(true);
    expect(fromSchema([30, 'Alice'])).toBe(false);
  });

  it('optional and rest slots carry their labels', () => {
    const fromBuilder = getRunTypeId(
      RT.tuple([RT.slot('start', TF.number())], [RT.slot('len', TF.number())], RT.slot('items', TF.string()))
    );
    const fromType = getRunTypeId<[start: number, len?: number, ...items: string[]]>();
    expect(fromBuilder).toBe(fromType);
  });

  it('written slot order defines slot order (anti-alphabetical pin)', () => {
    const fromBuilder = getRunTypeId(
      RT.tuple([RT.slot('z', TF.number()), RT.slot('y', TF.string()), RT.slot('a', RT.boolean())])
    );
    expect(fromBuilder).toBe(getRunTypeId<[z: number, y: string, a: boolean]>());
    expect(fromBuilder).not.toBe(getRunTypeId<[a: boolean, z: number, y: string]>());
  });

  it('same shape with different labels stays distinct', () => {
    const point = getRunTypeId(RT.tuple([RT.slot('x', TF.number()), RT.slot('y', TF.number())]));
    const size = getRunTypeId(RT.tuple([RT.slot('w', TF.number()), RT.slot('h', TF.number())]));
    expect(point).not.toBe(size);
  });

  it('func slot form converges with the written call signature — both getRunTypeId shapes', () => {
    const schema = RT.func([RT.slot('event', TF.string()), RT.slot('retries', TF.number())], RT.boolean());
    expect(getRunTypeId(schema)).toBe(getRunTypeId<(event: string, retries: number) => boolean>());
    const fromSchema = createValidateFn(schema);
    const fromType = createValidateFn<(event: string, retries: number) => boolean>();
    expect(fromSchema).toBe(fromType);
    // Params are behaviour-neutral: a top-level function passes the typeof gate.
    expect(fromSchema((_event: string, _retries: number) => true)).toBe(true);
    expect(fromSchema('not a function')).toBe(false);
  });

  it('carries labels through the params-tuple form of func', () => {
    const schema = RT.func(RT.tuple([RT.slot('input', TF.string())]), TF.number());
    expect(getRunTypeId(schema)).toBe(getRunTypeId<(input: string) => number>());
  });

  it('converges with the jsLabels schema spelling — one id across all three forms', () => {
    const fromBuilder = getRunTypeId(RT.tuple([RT.slot('name', TF.string()), RT.slot('age', TF.number())]));
    const fromSchema = getRunTypeId(
      runTypeFromJsonSchema({
        type: 'array',
        prefixItems: [{type: 'string'}, {type: 'number'}],
        minItems: 2,
        items: false,
        jsLabels: ['name', 'age'],
      } as const)
    );
    expect(fromBuilder).toBe(fromSchema);
    expect(fromBuilder).toBe(getRunTypeId<[name: string, age: number]>());
  });

  it('InferType recovers the labeled tuple (assignment-equivalent)', () => {
    const schema = RT.tuple([RT.slot('name', TF.string()), RT.slot('age', TF.number())]);
    type Recovered = InferType<typeof schema>;
    const value: [name: string, age: number] = ['Alice', 30];
    const fromType: Recovered = value;
    const toType: [name: string, age: number] = fromType;
    expect([fromType, toType]).toBeDefined();
  });

  it('standalone builder consts resolve the LIVE node in every arity (injected-id disambiguation)', () => {
    // Regression: the injected id is an entry-module TUPLE (an Array), which
    // the pre-slot disambiguation misread as the optional-items list (2-arg
    // form) or the rest element (3-arg form) — returning the discarded
    // carrier, so `.kind` came back undefined for every non-max-arity form.
    const pair = RT.tuple([TF.string(), TF.number()]);
    const withOptionals = RT.tuple([TF.string()], [TF.number()]);
    const withRest = RT.tuple([TF.string()], [TF.number()], RT.boolean());
    const labeled = RT.tuple([RT.slot('name', TF.string())]);
    for (const node of [pair, withOptionals, withRest, labeled]) {
      expect(node.kind, 'live reflected node, not the discarded carrier').toBeDefined();
      expect(typeof node.id).toBe('string');
    }
  });
});
