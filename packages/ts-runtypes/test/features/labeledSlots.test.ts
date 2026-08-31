// Labeled slot builders — `RT.tuple({required: [RT.slot('x', …)]})` names tuple
// slots, `RT.func({params: [RT.slot('event', …)], ret})` names function
// parameters. Labels ride
// the `__rtLabels` sentinel on the carried type and fold into the structural
// id, so the slot forms CONVERGE with their labeled type-first twins (one
// cache entry — pinned via factory reference identity and both `getRunTypeId`
// call shapes), while the plain array forms keep modeling the unlabeled
// shapes. Slots are an ARRAY on purpose: object keys cannot carry order (the
// checker sorts keyof unions by internal type id, not declaration order).

import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

describe('labeled slot builders', () => {
  it('tuple slot form converges with the labeled type-first tuple — both getRunTypeId shapes', () => {
    // Reflect shape: the id of the type the builder value models.
    const fromBuilder = getRunTypeId(RT.tuple({required: [RT.slot('name', TF.string()), RT.slot('age', TF.number())]}));
    // Static shape: caller supplies T.
    const fromType = getRunTypeId<[name: string, age: number]>();
    expect(fromBuilder).toBe(fromType);
    // The unlabeled array form stays a DISTINCT entry (labels are id data).
    expect(getRunTypeId(RT.tuple({required: [TF.string(), TF.number()]}))).not.toBe(fromType);
  });

  it('resolves the same cached validator factory as the type-first form', () => {
    const fromSchema = createValidateFn(RT.tuple({required: [RT.slot('name', TF.string()), RT.slot('age', TF.number())]}));
    const fromType = createValidateFn<[name: string, age: number]>();
    expect(fromSchema).toBe(fromType);
    expect(fromSchema(['Alice', 30])).toBe(true);
    expect(fromSchema([30, 'Alice'])).toBe(false);
  });

  it('optional and rest slots carry their labels', () => {
    const fromBuilder = getRunTypeId(
      RT.tuple({
        required: [RT.slot('start', TF.number())],
        optional: [RT.slot('len', TF.number())],
        rest: RT.slot('items', TF.string()),
      })
    );
    const fromType = getRunTypeId<[start: number, len?: number, ...items: string[]]>();
    expect(fromBuilder).toBe(fromType);
  });

  it('written slot order defines slot order (anti-alphabetical pin)', () => {
    const fromBuilder = getRunTypeId(
      RT.tuple({required: [RT.slot('z', TF.number()), RT.slot('y', TF.string()), RT.slot('a', RT.boolean())]})
    );
    expect(fromBuilder).toBe(getRunTypeId<[z: number, y: string, a: boolean]>());
    expect(fromBuilder).not.toBe(getRunTypeId<[a: boolean, z: number, y: string]>());
  });

  it('same shape with different labels stays distinct', () => {
    const point = getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number()), RT.slot('y', TF.number())]}));
    const size = getRunTypeId(RT.tuple({required: [RT.slot('w', TF.number()), RT.slot('h', TF.number())]}));
    expect(point).not.toBe(size);
  });

  it('func slot form converges with the written call signature — both getRunTypeId shapes', () => {
    const schema = RT.func({params: [RT.slot('event', TF.string()), RT.slot('retries', TF.number())], ret: RT.boolean()});
    expect(getRunTypeId(schema)).toBe(getRunTypeId<(event: string, retries: number) => boolean>());
    const fromSchema = createValidateFn(schema);
    const fromType = createValidateFn<(event: string, retries: number) => boolean>();
    expect(fromSchema).toBe(fromType);
    // Params are behaviour-neutral: a top-level function passes the typeof gate.
    expect(fromSchema((_event: string, _retries: number) => true)).toBe(true);
    expect(fromSchema('not a function')).toBe(false);
  });

  it('carries labels through the params-tuple form of func', () => {
    const schema = RT.func({params: RT.tuple({required: [RT.slot('input', TF.string())]}), ret: TF.number()});
    expect(getRunTypeId(schema)).toBe(getRunTypeId<(input: string) => number>());
  });

  it('InferType recovers the labeled tuple (assignment-equivalent)', () => {
    const schema = RT.tuple({required: [RT.slot('name', TF.string()), RT.slot('age', TF.number())]});
    type Recovered = InferType<typeof schema>;
    const value: [name: string, age: number] = ['Alice', 30];
    const fromType: Recovered = value;
    const toType: [name: string, age: number] = fromType;
    expect([fromType, toType]).toBeDefined();
  });

  it('standalone builder consts resolve the LIVE node in every group combination', () => {
    // The injected id is an entry-module TUPLE (an Array) and lands in the one
    // unfilled slot the group overloads declare, so every combination must come
    // back as the reflected node rather than the discarded carrier.
    const pair = RT.tuple({required: [TF.string(), TF.number()]});
    const withOptionals = RT.tuple({required: [TF.string()], optional: [TF.number()]});
    const withRest = RT.tuple({required: [TF.string()], optional: [TF.number()], rest: RT.boolean()});
    const restOnly = RT.tuple({required: [TF.string()], rest: RT.boolean()});
    const optionalOnly = RT.tuple({optional: [TF.number()]});
    const empty = RT.tuple({});
    const labeled = RT.tuple({required: [RT.slot('name', TF.string())]});
    const labeledRest = RT.tuple({required: [RT.slot('name', TF.string())], rest: RT.slot('tags', TF.string())});
    for (const node of [pair, withOptionals, withRest, restOnly, optionalOnly, empty, labeled, labeledRest]) {
      expect(node.kind, 'live reflected node, not the discarded carrier').toBeDefined();
      expect(typeof node.id).toBe('string');
    }
  });

  it('a labeled rest group needs no empty optional group — both getRunTypeId shapes', () => {
    // The group form's own shape: the positional spelling could only reach a
    // rest slot by passing an empty optional list first.
    const fromBuilder = getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number())], rest: RT.slot('items', TF.string())}));
    const fromType = getRunTypeId<[x: number, ...items: string[]]>();
    expect(fromBuilder).toBe(fromType);
    // An explicitly empty optional group is the same tuple, not a third entry.
    expect(
      getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number())], optional: [], rest: RT.slot('items', TF.string())}))
    ).toBe(fromType);
  });

  it('unlabeled groups converge with their type-first twins — both getRunTypeId shapes', () => {
    expect(getRunTypeId(RT.tuple({required: [TF.string(), TF.number()]}))).toBe(getRunTypeId<[string, number]>());
    expect(getRunTypeId(RT.tuple({required: [TF.string()], optional: [TF.number()]}))).toBe(getRunTypeId<[string, number?]>());
    expect(getRunTypeId(RT.tuple({required: [TF.string()], rest: TF.number()}))).toBe(getRunTypeId<[string, ...number[]]>());
    expect(getRunTypeId(RT.tuple({required: [TF.string()], optional: [TF.number()], rest: RT.boolean()}))).toBe(
      getRunTypeId<[string, number?, ...boolean[]]>()
    );
  });

  it('an all-empty group bag is the empty tuple, never the labeled empty one', () => {
    expect(getRunTypeId(RT.tuple({}))).toBe(getRunTypeId<[]>());
  });

  it('an omitted params group brands a no-params signature — both getRunTypeId shapes', () => {
    expect(getRunTypeId(RT.func())).toBe(getRunTypeId<() => void>());
    expect(getRunTypeId(RT.func({ret: TF.number()}))).toBe(getRunTypeId<() => number>());
    // An empty params list is the same signature, not a spurious rest parameter.
    expect(getRunTypeId(RT.func({params: [], ret: TF.number()}))).toBe(getRunTypeId<() => number>());
  });

  it('nests as a comptime-args child without an injected id of its own', () => {
    // The inner builder gets no id (only the outermost call site is a site), so
    // this exercises the discarded-carrier path the group form also has to feed.
    const schema = RT.array(RT.tuple({required: [RT.slot('name', TF.string())]}));
    expect(getRunTypeId(schema)).toBe(getRunTypeId<[name: string][]>());
  });
});
