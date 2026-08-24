import type {SharedCase} from '../types.ts';

export const CIRCULAR = {
  object_full_mion_shape: {
    title: 'Self-referential object with optional self-ref and Date prop',
    description:
      "circularRefs.spec.ts 'Circular object' — full fixture (number + string + self-ref + Date). Exercises the same self-recursive dependency call as OBJECT.circular_interface but pins the exact shape.",
    getSamples: () => ({
      valid: [
        {n: 1, s: 'hello', c: {n: 2, s: 'world'}},
        {n: 2, s: 'world'},
        {n: 3, s: 'foo', c: {n: 3, s: 'foo'}},
      ],
      invalid: [
        {n: 1, s: 'hello', c: {n: 2, s: 123}}, // c.s wrong type
        {n: 1, s: 'hello', c: {n: 2}}, // c.s missing
        null,
        undefined,
        {n: NaN, s: 'x'}, // NaN at n
        {n: 1, s: 'x', d: new Date('invalid')}, // Invalid Date in optional d
        {n: 1, s: 'x', d: 'not date'},
        {}, // missing required n and s
      ],
    }),
  },
  array_of_union_with_self_ref: {
    title: 'Self-referential array whose union element includes the array itself',
    description:
      "circularRefs.spec.ts 'Circular array + union' — self-recursive array whose element type is a union including the array itself. Closes the cycle via Array → Union → Array.",
    getSamples: () => {
      const date = new Date();
      const cu1: any = [date, 123, 'hello', ['a', 'b', 'c']];
      const cu2: any = [date, 123, 'hello', ['a', 2, 'c'], cu1];
      const cu3: any = [];
      return {
        valid: [cu1, cu2, cu3],
        invalid: [
          [date, 123, 'hello', ['a', 2, 'c'], {a: 1, b: 2}], // {} not in union
          ['hello', 123, [{a: 1, b: 2}]],
          {},
          null,
          undefined,
          [true], // boolean not in union
          [new Date('invalid')], // Invalid Date inside
          [NaN], // NaN as number
        ],
      };
    },
  },
  object_with_tuple_prop: {
    title: 'Self-referential object whose cycle closes via a tuple property',
    description:
      "circularRefs.spec.ts 'Circular object with tuple' — cycle closed via a tuple-typed property. Same mechanism as TUPLE.tuple_circular but the recursion goes through an object → tuple boundary.",
    getSamples: () => ({
      valid: [{tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]}, {tuple: [1n, {tuple: [2n]}]}, {tuple: [1n]}],
      invalid: [
        {tuple: [1n, {tuple: 'hello'}]}, // inner `tuple` not an array
        {tuple: [1n, {tuple: []}]}, // empty inner tuple — missing required bigint
        [],
        null,
        undefined,
        {tuple: ['not bigint']},
        {tuple: [1n, 'not object']}, // second slot wrong type
        {}, // missing required tuple prop
      ],
    }),
  },
  object_with_index_prop: {
    title: 'Self-referential object whose cycle closes via an index signature',
    description:
      "circularRefs.spec.ts 'Circular Object with index property' — cycle closed via an index-signature value type. Exercises the index-signature for-in loop calling back into the same validator.",
    getSamples: () => ({
      valid: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
      invalid: [
        {index: {a: 1234}}, // value not an object
        {index: {a: {index: 'hello'}}}, // nested `index` wrong type
        new Date(), // missing `index` property
        null,
        undefined,
        {}, // missing required index prop
        {index: 'not object'},
        {index: {a: null}},
      ],
    }),
  },
  object_deeply_nested: {
    title: 'Self-referential object with the cycle buried four levels deep',
    description:
      "circularRefs.spec.ts 'Circular Object with deep nested properties' — cycle closed via four levels of nested object properties. Stresses the dependency-call layer when the self-ref is buried deep in an anonymous-shape chain.",
    getSamples: () => ({
      valid: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
      invalid: [
        {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: 1234}}}}}}},
        {deep1: {}},
        {deep1: {deep2: {deep3: 12435}}},
        {deep1: {deep2: {deep3: {deep4: 'hello'}}}},
        'hello',
        null,
        undefined,
        {}, // missing deep1
        {deep1: null},
        {deep1: {deep2: null}},
      ],
    }),
  },
  circular_child_under_literal_root: {
    title: 'Non-circular root holding a circular child interface',
    description:
      "interface.spec.ts 'Interface with nested circular type where root is not the circular ref' — RootNotCircular is a flat shape (literal discriminator + one prop) whose ciChild property is a self-referential ICircularDeep. Pins the case where the dependency-call layer kicks in BELOW the root rather than at the root itself.",
    getSamples: () => ({
      valid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
          },
        },
      ],
      invalid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}, // embedded.hello wrong type
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
          },
        }, // deep embedded.hello wrong type
        {
          isRoot: false, // not the literal true
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world', child: 123}},
        },
        {isRoot: true, ciChild: {name: 'hello', big: 1n}}, // missing embedded
        {isRoot: true}, // missing ciChild
        null,
        undefined,
        {},
      ],
    }),
  },
  multiple_circular_types_cross_referenced: {
    title: 'Multiple circular types cross-referenced from a non-circular root',
    description:
      "interface.spec.ts 'Interface with nested circular + multiple circular' — RootCircular carries an optional self-ref AND two distinct circular siblings (ICircularDeep, ICircularDate), and ICircularDate also references ICircularDeep. Stresses the resolver / dependency-call layer when more than one recursive type is in flight at once and the cycles cross.",
    getSamples: () => ({
      valid: [
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {
            date: new Date(),
            month: 1,
            year: 2021,
            embedded: {date: new Date(), month: 1, year: 2021},
          },
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciRoort: {
            isRoot: true,
            ciChild: {name: 'inner', big: 2n, embedded: {hello: 'world'}},
            ciDate: {date: new Date(), month: 6, year: 2022},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
      ],
      invalid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}, // missing ciDate, embedded.hello wrong type
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        }, // deep embedded.hello wrong type
        {
          isRoot: false, // not the literal true
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: 'not date', month: 1, year: 2021}, // ciDate.date wrong type
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021, embedded: true}, // ciDate.embedded wrong type
        },
        null,
        undefined,
        {},
      ],
    }),
  },
} as const satisfies Record<string, SharedCase>;
