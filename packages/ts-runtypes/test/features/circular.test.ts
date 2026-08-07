// `circular(…)` + `self()` — recursive schemas with NO hand-written
// type. Each lowers to a CORRECT validator and CONVERGES with the equivalent
// type-first recursive type (the structural cycle-token anchor in typeid.go makes
// the anonymous `Recursive<Body>` and a named interface hash the same). The
// `interface`s below are only the type-first half of the convergence checks.

import * as TF from '@ts-runtypes/core/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn, type InferType} from '@ts-runtypes/core';
import {circular, self, object, optional, array, union, record, literal} from '@ts-runtypes/core/builders';
import '@ts-runtypes/core/formats';

describe('circular() — recursive schemas without types', () => {
  it('object self-ref validates + converges (static & reflect)', () => {
    const Node = circular(object({n: TF.number(), s: TF.string(), c: optional(self())}));
    const isNode = createValidateFn(Node);
    expect(isNode({n: 1, s: 'a'})).toBe(true);
    expect(isNode({n: 1, s: 'a', c: {n: 2, s: 'b', c: {n: 3, s: 'c'}}})).toBe(true);
    expect(isNode({n: 1, s: 'a', c: {n: 2, s: 123 as unknown as string}})).toBe(false);
    expect(isNode({n: 1})).toBe(false);

    interface NodeT {
      n: number;
      s: string;
      c?: NodeT;
    }
    expect(isNode).toBe(createValidateFn<NodeT>());
    const sample: NodeT = {n: 1, s: 'a'};
    expect(isNode).toBe(createValidateFn(sample));

    type Inferred = InferType<typeof Node>;
    const v: Inferred = {n: 1, s: 'a', c: {n: 2, s: 'b'}};
    expect(v.c?.n).toBe(2);
  });

  it('array + union self-ref converges', () => {
    const Cu = circular(array(union([self(), TF.date(), TF.number(), TF.string()])));
    const isCu = createValidateFn(Cu);
    expect(isCu([1, 'a', new Date(), [2, 'b']])).toBe(true);
    expect(isCu([true])).toBe(false);
    type CuArray = (CuArray | Date | number | string)[];
    expect(isCu).toBe(createValidateFn<CuArray>());
  });

  it('cycle through a record / index-signature converges', () => {
    const Ci = circular(object({index: record(self())}));
    interface CircularIndex {
      index: {[k: string]: CircularIndex};
    }
    expect(createValidateFn(Ci)).toBe(createValidateFn<CircularIndex>());
  });

  it('cycle through a tuple PROPERTY converges (the case bare tokens broke)', () => {
    const Ct = circular(object({tuple: array(self())}));
    interface CircularArrayProp {
      tuple: CircularArrayProp[];
    }
    expect(createValidateFn(Ct)).toBe(createValidateFn<CircularArrayProp>());
  });

  it('mutual recursion via direct cross-references converges', () => {
    const icd = circular(object({name: TF.string(), embedded: object({hello: TF.string(), child: optional(self())})}));
    const root = circular(object({isRoot: literal(true), ciChild: icd, ciSelf: optional(self())}));
    const isRoot = createValidateFn(root);
    expect(isRoot({isRoot: true, ciChild: {name: 'a', embedded: {hello: 'h'}}})).toBe(true);
    expect(isRoot({isRoot: true, ciChild: {name: 'a', embedded: {hello: 123}}})).toBe(false);

    interface ICircularDeep {
      name: string;
      embedded: {hello: string; child?: ICircularDeep};
    }
    interface RootCircular {
      isRoot: true;
      ciChild: ICircularDeep;
      ciSelf?: RootCircular;
    }
    expect(isRoot).toBe(createValidateFn<RootCircular>());
  });

  it('getValidationErrors via circular() converges', () => {
    const Node = circular(object({n: TF.number(), c: optional(self())}));
    interface NodeT {
      n: number;
      c?: NodeT;
    }
    expect(createGetValidationErrorsFn(Node)).toBe(createGetValidationErrorsFn<NodeT>());
  });
});
