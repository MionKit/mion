// cloning / Objects — plain objects and class instances. Objects always
// rebuild from the declared shape (no key-count gates, no reuse shortcuts —
// measured slower than the rebuild below ~30 props); class instances rebuild
// prototype-preservingly via `Object.create(Object.getPrototypeOf(v))`, so
// `instanceof` and prototype methods survive while own extras drop.
// Case keys mirror serialization/Objects.ts; cloning-only cases are appended
// at the end of the map.

import {expect} from 'vitest';
import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

// Class cases clone prototype-preservingly, so each class must be a single
// module-scope identity shared by the clone thunk, the getTestData instances,
// and verifyClone's `toBeInstanceOf` (the serialization suite could declare
// them inline per thunk because decode never restored the prototype).
class MySerializableClass {
  name: string;
  surname: string;
  id: number;
  startDate: Date;
  constructor() {
    this.name = 'John';
    this.surname = 'Doe';
    this.id = 0;
    this.startDate = new Date('2000-08-06T02:13:00.000Z');
  }
  getFullName() {
    return `${this.name} ${this.surname}`;
  }
}

class BaseClass {
  baseProp: string = 'base';
}

class ExtendedClass extends BaseClass {
  extendedProp: string = 'extended';
}

class NonSerializableClass {
  constructor(
    public name: string,
    public surname: string,
    public id: number,
    public startDate: Date
  ) {}
  getFullName() {
    return `${this.name} ${this.surname}`;
  }
}

class Ledger {
  constructor(
    public owner: string,
    public opened: Date,
    public balance: bigint,
    public tags: string[]
  ) {}
  summary(): string {
    return `${this.owner}:${this.balance}`;
  }
}

class Vertex {
  constructor(
    public x: number,
    public y: number
  ) {}
  norm(): number {
    return Math.hypot(this.x, this.y);
  }
}

// Identity-stable pass-through function reference: the twice-called
// getTestData builder must return the SAME function object both times.
const methodProp = () => 'method result';

interface User {
  name: string;
  address: {street: string; city: string};
}

class Point {
  x = 0;
  y = 0;
  len(): number {
    return Math.hypot(this.x, this.y);
  }
}

function makePoint(x: number, y: number, extra?: boolean): Point {
  const p = new Point();
  p.x = x;
  p.y = y;
  if (extra) (p as unknown as Record<string, unknown>).extra = 'gone';
  return p;
}

export const OBJECTS = {
  interface: {
    title: 'Interface',
    description:
      'Object literal mixing a Date field, bigint, number, string, null, a string array, a weird-named key, and an optional string — every declared prop deep-clones with a fresh Date and array, and the absent optional stays absent.',
    clone: () =>
      createCloneExactShapeFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(),
    getTestData: () => {
      const value = {
        startDate: new Date('2000-08-06T02:13:00.000Z'),
        quantity: 123,
        name: 'hello',
        nullValue: null,
        big: BigInt(123),
        stringArray: ['a', 'b', 'c'],
        "weird prop name \n?>'\\\t\r": 'hello2',
      };
      const valueWithOptional = {...value, optionalString: 'hello3'};
      return {values: [value, valueWithOptional]};
    },
  },
  many_optional_props: {
    title: 'Many optional props',
    description:
      'Object with 32 optional number properties cloned from sparse subsets and the empty object — only the keys present are copied, absent optionals stay absent.',
    clone: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createCloneExactShapeFn<ManyOptional>();
    },
    getTestData: () => ({
      values: [{a0: 0, a1: 1, b0: 16, a8: 8, b7: 23, b15: 31}, {a0: 0, b8: 24}, {}],
    }),
  },
  class: {
    title: 'Class',
    description:
      'Class instance rebuilds prototype-preservingly — `instanceof` holds and getFullName() still works on the clone — unlike serialization, which decays it to a plain object.',
    clone: () => createCloneExactShapeFn<MySerializableClass>(),
    getTestData: () => ({values: [new MySerializableClass()]}),
    verifyClone: (out) => {
      expect(out).toBeInstanceOf(MySerializableClass);
      expect((out as MySerializableClass).getFullName()).toBe('John Doe');
    },
  },
  extended_class: {
    title: 'Extended class',
    description:
      'Subclass instance clones with its own extendedProp and the inherited baseProp both copied, and the prototype chain preserved so `instanceof ExtendedClass` holds.',
    clone: () => createCloneExactShapeFn<ExtendedClass>(),
    getTestData: () => ({values: [new ExtendedClass()]}),
    verifyClone: (out) => {
      expect(out).toBeInstanceOf(ExtendedClass);
    },
  },
  non_serializable_class: {
    title: 'Non-serializable class',
    description:
      '"Non-serializable" only on the wire: the clone rebuilds a real instance on the preserved prototype, keeping the data fields (including the startDate Date) and the working getFullName() method.',
    clone: () => createCloneExactShapeFn<NonSerializableClass>(),
    getTestData: () => ({
      values: [new NonSerializableClass('John', 'Doe', 0, new Date('2000-08-06T02:13:00.000Z'))],
    }),
    verifyClone: (out) => {
      expect(out).toBeInstanceOf(NonSerializableClass);
      expect((out as NonSerializableClass).getFullName()).toBe('John Doe');
    },
  },
  undefined_in_object: {
    title: 'Undefined prop',
    description:
      'A declared `undefined`-typed property is plain data for the clone: the `c` key is copied with its `undefined` value rather than dropped.',
    cloneNotes:
      'Serialization omits the undefined-valued key on the wire and it is absent after the round-trip; the clone has no wire and keeps the declared key present with value `undefined`.',
    clone: () => createCloneExactShapeFn<{a: string; b: number; c: undefined}>(),
    getTestData: () => ({values: [{a: 'hello', b: 42, c: undefined}]}),
  },
  optional_properties_order: {
    title: 'Optional props order',
    description:
      'Required `a` plus optional `b` clone with the optional present in one sample and absent in the other; the absent key is never materialized on the clone.',
    clone: () => createCloneExactShapeFn<{a: string; b?: string}>(),
    getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}]}),
  },
  all_optional_fields: {
    title: 'All optional fields',
    description:
      'A fully-optional shape clones any subset of keys — both present, one present, and the empty object — copying exactly the keys that exist.',
    clone: () => createCloneExactShapeFn<{a?: string; b?: string}>(),
    getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}, {}]}),
  },
  extras_passthrough_unsafe: {
    title: 'Extras passthrough',
    description:
      'Cloning has no unsafe passthrough: undeclared extras at the root and inside declared nested objects are dropped by construction while every declared child deep-clones.',
    cloneNotes:
      "The serialization suite's mutate strategy lets these extras ride through `JSON.stringify`; the exact-shape clone rebuilds from the declared shape, so the same input comes out extras-free.",
    clone: () =>
      createCloneExactShapeFn<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(),
    getTestData: () => {
      const startDate = new Date('2000-08-06T02:13:00.000Z');
      const objectWithExtraParams = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        deep: {a: 'hello', b: 123, cExtra: true},
        '?other weird p': {c: 'hello', d: 123, eExtra: true},
        extraA: 'hello',
        extraB: 123,
        extraC: true,
      };
      const noExtraParams = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        deep: {a: 'hello', b: 123},
        '?other weird p': {c: 'hello', d: 123},
      };
      return {values: [objectWithExtraParams], expected: [noExtraParams]};
    },
  },
  interface_circular: {
    title: 'Circular interface',
    description:
      'Self-referential interface with an optional `child` of its own type deep-clones a finite nested tree with a fresh object at every level.',
    clone: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createCloneExactShapeFn<ICircular>();
    },
    getTestData: () => ({
      values: [{name: 'leaf'}, {name: 'hello', child: {name: 'world'}}, {name: 'a', child: {name: 'b', child: {name: 'c'}}}],
    }),
  },
  interface_circular_array: {
    title: 'Circular array',
    description:
      'Self-referential interface recursing through an optional array of itself clones the empty and populated children arrays with fresh array and element identities.',
    clone: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createCloneExactShapeFn<ICircularArray>();
    },
    getTestData: () => ({
      values: [
        {name: 'hello', children: []},
        {name: 'hello', children: [{name: 'world'}]},
      ],
    }),
  },
  interface_circular_deep: {
    title: 'Circular deep',
    description:
      'Recursion buried inside a nested `embedded` object with a bigint at each level deep-clones every depth, the bigints passing by value.',
    clone: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createCloneExactShapeFn<ICircularDeep>();
    },
    getTestData: () => ({
      values: [
        {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        {
          name: 'hello',
          big: 2n,
          embedded: {hello: 'world', child: {name: 'world1', big: 3n, embedded: {hello: 'world2'}}},
        },
      ],
    }),
  },
  interface_root_not_circular: {
    title: 'Non-circular root',
    description:
      'Non-recursive root with literal `isRoot: true` embedding a circular bigint-bearing member clones correctly when only the nested type is circular.',
    clone: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createCloneExactShapeFn<RootNotCircular>();
    },
    getTestData: () => ({
      values: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 2n,
            embedded: {hello: 'world', child: {name: 'world1', big: 2n, embedded: {hello: 'world2'}}},
          },
        },
      ],
    }),
  },
  interface_multiple_circular: {
    title: 'Multiple circular',
    description:
      'Several distinct circular interfaces coexisting in one graph — a bigint-bearing tree and a Date-bearing one — deep-clone with fresh objects and fresh Dates at every level.',
    clone: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createCloneExactShapeFn<RootCircular>();
    },
    getTestData: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      const ciDate: ICircularDate = {date: new Date('2000-08-06T02:13:00.000Z'), month: 1, year: 2021};
      // Exercise the so-far-unpopulated edges: the root self-reference
      // (`ciRoort`) and the ICircularDate recursion (`embedded`) plus its
      // cross-type `deep` ICircularDeep branch.
      const ciDateNested: ICircularDate = {
        date: new Date('2001-09-07T03:14:00.000Z'),
        month: 9,
        year: 2001,
        embedded: {date: new Date('2002-10-08T04:15:00.000Z'), month: 10, year: 2002},
        deep: {name: 'deepName', big: 7n, embedded: {hello: 'deepHello'}},
      };
      return {
        values: [
          {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}, ciDate},
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 1n,
              embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
            ciDate,
          },
          {
            isRoot: true,
            ciChild: {name: 'outer', big: 3n, embedded: {hello: 'outerEmbedded'}},
            ciRoort: {isRoot: true, ciChild: {name: 'inner', big: 5n, embedded: {hello: 'innerEmbedded'}}, ciDate},
            ciDate: ciDateNested,
          },
        ],
      };
    },
  },
  interface_with_methods: {
    title: 'Interface with methods',
    description:
      'A declared function-typed property is KEPT on the clone, shared by reference — functions cannot be rebuilt, and declared members are never dropped (only undeclared keys are).',
    cloneNotes:
      'The build emits a CES010 advisory naming the shared member; serializers drop it on the wire instead. Class METHODS differ — they ride the shared prototype (CES011).',
    clone: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createCloneExactShapeFn<ObjectWithMethods>();
    },
    getTestData: () => ({values: [{name: 'John', methodProp}]}),
  },
  registered_root_class: {
    title: 'Registered root class (Date + bigint + array)',
    description:
      'The `Ledger` instance rebuilds prototype-preservingly with a fresh Date and tags array and its bigint copied by value — no serializer registry involved.',
    cloneNotes:
      'The class serializer registry is serialization-only machinery: cloning reconstructs a real instance directly from the preserved prototype, so no registration is needed.',
    clone: () => createCloneExactShapeFn<Ledger>(),
    getTestData: () => ({
      values: [
        new Ledger('alice', new Date('2023-06-01T00:00:00.000Z'), 10000000000000000000n, ['x', 'y']),
        new Ledger('bob', new Date('2019-02-03T04:05:06.000Z'), 0n, []),
      ],
    }),
    verifyClone: (out) => {
      expect(out).toBeInstanceOf(Ledger);
    },
  },
  nested_registered_class: {
    title: 'Object holding a registered class property',
    description:
      'A class instance nested as `origin` inside a plain object rebuilds prototype-preservingly in place — the container and the `Vertex` both get fresh identities.',
    clone: () => createCloneExactShapeFn<{name: string; origin: Vertex}>(),
    getTestData: () => ({
      values: [
        {name: 'triangle', origin: new Vertex(3, 4)},
        {name: 'origin', origin: new Vertex(0, 0)},
      ],
    }),
    verifyClone: (out) => {
      expect((out as {origin: unknown}).origin).toBeInstanceOf(Vertex);
    },
  },
  flat: {
    title: 'flat object',
    description: 'A flat all-required object rebuilds; undeclared keys are dropped by construction and the input keeps them.',
    clone: () => createCloneExactShapeFn<{a: string; b: number}>(),
    getTestData: () => ({
      values: [
        {a: 'x', b: 1},
        {a: 'y', b: 2, extra: true, more: 'gone'},
      ],
      expected: [
        {a: 'x', b: 1},
        {a: 'y', b: 2},
      ],
    }),
  },
  frozen: {
    title: 'frozen input',
    description: 'A frozen input clones fine — the input is never written, and the clone is a fresh unfrozen object.',
    cloneNotes: 'The removed delete-based strip could never handle frozen inputs (strict-mode TypeError).',
    clone: () => createCloneExactShapeFn<{a: string}>(),
    getTestData: () => ({
      values: [Object.freeze({a: 'x', extra: 1})],
      expected: [{a: 'x'}],
    }),
    verifyClone: (out) => {
      expect(Object.isFrozen(out)).toBe(false);
    },
  },
  optionalAbsent: {
    title: 'absent optional property',
    description: 'An absent optional stays ABSENT on the clone (no `key: undefined` placeholder).',
    clone: () => createCloneExactShapeFn<{a: string; b?: number}>(),
    getTestData: () => ({
      values: [
        {a: 'x', extra: 9},
        {a: 'y', b: 2},
      ],
      expected: [{a: 'x'}, {a: 'y', b: 2}],
    }),
    verifyClone: (out) => {
      if ((out as {a: string}).a === 'x') expect('b' in (out as object)).toBe(false);
    },
  },
  nested: {
    title: 'nested object',
    description: 'Nested objects rebuild with fresh identities at every level; nested extras drop, the input keeps them.',
    clone: () => createCloneExactShapeFn<User>(),
    getTestData: () => ({
      values: [{name: 'jane', address: {street: '10', city: 'sf', extra: true}}],
      expected: [{name: 'jane', address: {street: '10', city: 'sf'}}],
    }),
  },
  classInstance: {
    title: 'class instance',
    description:
      'A plain class instance rebuilds via `Object.create(Object.getPrototypeOf(v))` + declared-prop assigns: `instanceof` holds, prototype methods work, own extras drop, and the constructor never runs.',
    cloneNotes:
      'Methods are not copied as own properties — they ride the shared class prototype, exactly like any two `new Point()` instances.',
    clone: () => createCloneExactShapeFn<Point>(),
    getTestData: () => ({
      values: [makePoint(3, 4, true)],
      expected: [makePoint(3, 4)],
    }),
    verifyClone: (out) => {
      expect(out).toBeInstanceOf(Point);
      expect((out as Point).len()).toBe(5);
      expect('extra' in (out as object)).toBe(false);
    },
  },
} satisfies Record<string, CloningCase>;
