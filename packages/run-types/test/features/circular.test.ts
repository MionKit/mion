// `circular(…)` + `self()` — recursive schemas with NO hand-written
// type. Each lowers to a CORRECT validator and CONVERGES with the equivalent
// type-first recursive type (the structural cycle-token anchor in typeid.go makes
// the anonymous `Recursive<Body>` and a named interface hash the same). The
// `interface`s below are only the type-first half of the convergence checks.

import * as TF from '@mionjs/run-types/formats';
import * as TFT from '@mionjs/run-types/formats/temporal';
import {describe, expect, it} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn, getRunTypeId, type InferType} from '@mionjs/run-types';
import {
  circular,
  self,
  object,
  optional,
  array,
  union,
  record,
  literal,
  tuple,
  slot,
  func,
  map,
  set,
  intersection,
  unknown as rtUnknown,
  never as rtNever,
} from '@mionjs/run-types/builders';
import '@mionjs/run-types/formats';

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

// Sentinel payloads (structural format params, the schema-check slots, tuple
// labels) ride an intersection beside their base. `Recursive<Body>` used to
// destroy those: the container rebuilds either dropped the intersection or
// folded it into the base, so a value-first circular resolved a DIFFERENT id
// than its type-first twin. The substitution now returns a node that does not
// recurse VERBATIM and rebuilds a recursing one piece by piece — every pin
// below is a shape that diverged before, in BOTH marker call shapes.
describe('circular() — sentinel payloads survive the self-substitution', () => {
  it('params-branded record BESIDE the cycle converges', () => {
    const Node = circular(object({k: record(TF.number(), {minProperties: 2}), next: optional(self())}));
    interface NodeT {
      k: TF.FormattedObject<Record<string, number>, {minProperties: 2}>;
      next?: NodeT;
    }
    expect(getRunTypeId(Node)).toBe(getRunTypeId<NodeT>());
    const sample: NodeT = {k: {a: 1, b: 2}};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<NodeT>());
  });

  it('params-branded record CARRYING the cycle converges', () => {
    const Node = circular(object({k: record(self(), {minProperties: 2})}));
    interface NodeT {
      k: TF.FormattedObject<Record<string, NodeT>, {minProperties: 2}>;
    }
    expect(getRunTypeId(Node)).toBe(getRunTypeId<NodeT>());
    const sample: NodeT = {k: {}};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<NodeT>());
  });

  it('branded array — beside and carrying the cycle — converges', () => {
    const Beside = circular(object({tags: array(TF.string(), {minItems: 1}), next: optional(self())}));
    interface BesideT {
      tags: TF.FormattedArray<string[], {minItems: 1}>;
      next?: BesideT;
    }
    expect(getRunTypeId(Beside)).toBe(getRunTypeId<BesideT>());

    const Through = circular(object({kids: array(self(), {minItems: 2})}));
    interface ThroughT {
      kids: TF.FormattedArray<ThroughT[], {minItems: 2}>;
    }
    expect(getRunTypeId(Through)).toBe(getRunTypeId<ThroughT>());
    const sample: ThroughT = {kids: []};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<ThroughT>());
  });

  it('contains + patternProperties payloads converge', () => {
    const Contains = circular(object({k: array(rtUnknown(), {contains: TF.number()}), next: optional(self())}));
    interface ContainsT {
      k: TF.FormattedArray<unknown[], {contains: number}>;
      next?: ContainsT;
    }
    expect(getRunTypeId(Contains)).toBe(getRunTypeId<ContainsT>());

    // The payload itself holds the cycle — the walk must look INSIDE a
    // sentinel slot, which an `unknown`-valued sibling used to mask.
    const Pattern = circular(object({k: record(rtUnknown(), {patternProperties: {'^a': self()}})}));
    interface PatternT {
      k: TF.FormattedObject<Record<string, unknown>, {patternProperties: {'^a': PatternT}}>;
    }
    expect(getRunTypeId(Pattern)).toBe(getRunTypeId<PatternT>());
    const sample: PatternT = {k: {}};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<PatternT>());
  });

  it('labeled tuple — beside and carrying the cycle — converges', () => {
    const Beside = circular(
      object({k: tuple({required: [slot('x', TF.number()), slot('y', TF.string())]}), next: optional(self())})
    );
    interface BesideT {
      k: [x: number, y: string];
      next?: BesideT;
    }
    expect(getRunTypeId(Beside)).toBe(getRunTypeId<BesideT>());

    const Through = circular(object({k: tuple({required: [slot('head', TF.number()), slot('tail', self())]})}));
    interface ThroughT {
      k: [head: number, tail: ThroughT];
    }
    expect(getRunTypeId(Through)).toBe(getRunTypeId<ThroughT>());
    const sample = {k: [1, null as unknown as ThroughT]} as ThroughT;
    expect(getRunTypeId(sample)).toBe(getRunTypeId<ThroughT>());
  });

  it('labeled function params carrying the cycle converge', () => {
    const Node = circular(object({run: func({params: [slot('next', self())], ret: TF.number()})}));
    interface NodeT {
      run: (next: NodeT) => number;
    }
    expect(getRunTypeId(Node)).toBe(getRunTypeId<NodeT>());
  });

  it('carrier nested inside a carrier converges', () => {
    const Node = circular(object({k: record(array(self(), {minItems: 1}), {minProperties: 2})}));
    interface NodeT {
      k: TF.FormattedObject<Record<string, TF.FormattedArray<NodeT[], {minItems: 1}>>, {minProperties: 2}>;
    }
    expect(getRunTypeId(Node)).toBe(getRunTypeId<NodeT>());
    const sample: NodeT = {k: {}};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<NodeT>());
  });

  it('Map / Set values carrying the cycle converge', () => {
    const AsMap = circular(object({k: map(TF.string(), self())}));
    interface MapT {
      k: Map<string, MapT>;
    }
    expect(getRunTypeId(AsMap)).toBe(getRunTypeId<MapT>());

    const AsSet = circular(object({k: set(self())}));
    interface SetT {
      k: Set<SetT>;
    }
    expect(getRunTypeId(AsSet)).toBe(getRunTypeId<SetT>());
  });

  it('a top-type sibling does not hide the recursion', () => {
    // `unknown` absorbs any union it sits in, so reading a composite's members
    // as ONE union (`T[number]` / `T[keyof T]`) made `Self | unknown` read as
    // `unknown` and the node looked non-recursive — it was then returned
    // verbatim with the marker still in it. Found by the convert fuzz lane.
    const Tup = circular(object({p: tuple({required: [self(), rtNever(), rtUnknown()]})}));
    interface TupT {
      p: [TupT, never, unknown];
    }
    expect(getRunTypeId(Tup)).toBe(getRunTypeId<TupT>());

    const Obj = circular(object({a: self(), b: rtUnknown()}));
    interface ObjT {
      a: ObjT;
      b: unknown;
    }
    expect(getRunTypeId(Obj)).toBe(getRunTypeId<ObjT>());
  });

  it('optional-slot labeled tuples converge', () => {
    // An optional slot leaves the tuple without a single literal arity, so it
    // is rebuilt as required slots + `Partial` of the rest, labels re-attached.
    interface LooseT {
      link: [head: number, tail?: LooseT];
    }
    const Loose = circular(object({link: tuple({required: [slot('head', TF.number())], optional: [slot('tail', self())]})}));
    expect(getRunTypeId(Loose)).toBe(getRunTypeId<LooseT>());
    const sample: LooseT = {link: [1]};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<LooseT>());

    interface TwoOptT {
      link: [a: number, b?: string, c?: TwoOptT];
    }
    expect(
      getRunTypeId(
        circular(
          object({link: tuple({required: [slot('a', TF.number())], optional: [slot('b', TF.string()), slot('c', self())]})})
        )
      )
    ).toBe(getRunTypeId<TwoOptT>());

    interface AllOptT {
      link: [a?: number, b?: AllOptT];
    }
    expect(getRunTypeId(circular(object({link: tuple({optional: [slot('a', TF.number()), slot('b', self())]})})))).toBe(
      getRunTypeId<AllOptT>()
    );

    interface FnT {
      run: (a: number, b?: FnT) => number;
    }
    expect(
      getRunTypeId(
        circular(
          object({
            run: func({params: tuple({required: [slot('a', TF.number())], optional: [slot('b', self())]}), ret: TF.number()}),
          })
        )
      )
    ).toBe(getRunTypeId<FnT>());
  });

  it('builtin class values inside a cycle converge', () => {
    // Date and RegExp were always passed through as leaves; Temporal joined
    // them. Walking a Temporal value is not just wasteful but wrong — its
    // methods return Temporal, so the walk circularly references itself, the
    // checker resolves the member to `any`, and a BRANDED value was then
    // rebuilt into a plain object with a different id.
    interface BrandedT {
      value: TFT.PlainDateTime<{max: 'now+P1DT2H'}>;
      next?: BrandedT;
      kids: BrandedT[];
    }
    const Branded = circular(
      object({value: TFT.plainDateTime({max: 'now+P1DT2H'}), next: optional(self()), kids: array(self())})
    );
    expect(getRunTypeId(Branded)).toBe(getRunTypeId<BrandedT>());
    const sample: BrandedT = {value: null as unknown as BrandedT['value'], kids: []};
    expect(getRunTypeId(sample)).toBe(getRunTypeId<BrandedT>());

    interface BareT {
      at: Temporal.Instant;
      next?: BareT;
    }
    expect(getRunTypeId(circular(object({at: TFT.instant(), next: optional(self())})))).toBe(getRunTypeId<BareT>());

    interface DurationT {
      span: Temporal.Duration;
      next?: DurationT;
    }
    expect(getRunTypeId(circular(object({span: TFT.duration(), next: optional(self())})))).toBe(getRunTypeId<DurationT>());

    interface DateT {
      when: Date;
      next?: DateT;
    }
    expect(getRunTypeId(circular(object({when: TF.date(), next: optional(self())})))).toBe(getRunTypeId<DateT>());
  });

  it('a body with NO self-reference is returned untouched', () => {
    // The short-circuit's other half: a body the cycle never reaches keeps its
    // exact shape, so it stays identical to the plain (non-circular) spelling.
    const Plain = object({a: TF.string(), k: record(TF.number(), {minProperties: 2})});
    const Wrapped = circular(object({a: TF.string(), k: record(TF.number(), {minProperties: 2})}));
    expect(getRunTypeId(Wrapped)).toBe(getRunTypeId(Plain));
  });
});

// A self-reference is tied by a DEFERRED position: an object member, an array
// element, a Map / Set / Promise argument, a function parameter. Two spellings
// look deferred but are not, because both are ALIAS instantiations whose
// argument TypeScript resolves while it is still resolving the enclosing type:
// `Record<string, V>` and a tuple slot. The record case is fixable — the index
// signature `{[key: string]: V}` says the same thing and defers — and is pinned
// below. The tuple case is not: a mapped tuple computes every slot up front, so
// `[number, Self]` unrolls the recursion instead of substituting it, and the
// converter refuses that shape on both value-first targets
// (test/features/unsupported-conversion.test.ts).
describe('circular() — a cycle at the ROOT of a record', () => {
  it('a self-valued index converges in both forms', () => {
    interface Tree {
      [key: string]: Tree;
    }
    const typeFirst = getRunTypeId<Tree>();
    expect(getRunTypeId(circular(record(self())))).toBe(typeFirst);
    const sample: Tree = {a: {}};
    expect(getRunTypeId(sample)).toBe(typeFirst);
  });

  it('a self-or-number index converges in both forms', () => {
    interface Loose {
      [key: string]: Loose | number;
    }
    const typeFirst = getRunTypeId<Loose>();
    expect(getRunTypeId(circular(record(union([self(), TF.number()]))))).toBe(typeFirst);
    const sample: Loose = {a: 1};
    expect(getRunTypeId(sample)).toBe(typeFirst);
  });

  it('a self-valued index BESIDE named members converges', () => {
    interface Mixed {
      name: string;
      [key: string]: Mixed | string;
    }
    expect(getRunTypeId(circular(intersection(record(union([self(), TF.string()])), object({name: TF.string()}))))).toBe(
      getRunTypeId<Mixed>()
    );
  });
});
