// Circular-reference GUARD cases for the serialization suite. Each recursive
// TYPE is fed a runtime VALUE containing a reference cycle; with the per-call
// `{rejectCircularRefs: true}` option armed, `createJsonEncoderFn` / `createBinaryEncoderFn`
// throw `CircularReferenceError` before recursing forever (matching
// JSON.stringify). Acyclic controls (DAG, disarmed) encode without throwing.

import {createBinaryEncoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import type {CircularGuardSerializationCase} from '../../util/circularGuardAsserts.ts';

export const CIRCULAR_GUARD = {
  cycle_object_property: {
    title: 'Cycle through an object property',
    jsonEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {name: string; next?: unknown} = {name: 'a'};
      node.next = node;
      return node;
    },
    expectThrows: true,
  },

  cycle_array_element: {
    title: 'Cycle through an array element',
    jsonEncoder: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {label: string; children: unknown[]} = {label: 'r', children: []};
      node.children.push(node);
      return node;
    },
    expectThrows: true,
  },

  cycle_tuple_slot: {
    title: 'Cycle through a tuple slot',
    jsonEncoder: () => {
      interface Node {
        head: number;
        tail?: [Node];
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        head: number;
        tail?: [Node];
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {head: number; tail?: unknown[]} = {head: 1};
      node.tail = [node];
      return node;
    },
    expectThrows: true,
  },

  cycle_index_signature: {
    title: 'Cycle through an index-signature value',
    jsonEncoder: () => {
      interface Node {
        [key: string]: Node;
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        [key: string]: Node;
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: Record<string, unknown> = {};
      node.self = node;
      return node;
    },
    expectThrows: true,
  },

  cycle_union_member: {
    title: 'Cycle through a union member',
    jsonEncoder: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {value: number; next: unknown} = {value: 1, next: null};
      node.next = node;
      return node;
    },
    expectThrows: true,
  },

  cycle_deeply_nested: {
    title: 'Cycle behind several plain-object levels',
    jsonEncoder: () => {
      interface Node {
        name: string;
        a: {b: {c?: Node}};
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        a: {b: {c?: Node}};
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const root: {name: string; a: {b: {c?: unknown}}} = {name: 'r', a: {b: {}}};
      root.a.b.c = root;
      return root;
    },
    expectThrows: true,
  },

  cycle_under_noncircular_root: {
    title: 'Cycle in a child under a non-circular root',
    jsonEncoder: () => {
      interface Recursive {
        name: string;
        next?: Recursive;
      }
      interface Wrapper {
        id: number;
        node?: Recursive;
      }
      return createJsonEncoderFn<Wrapper>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Recursive {
        name: string;
        next?: Recursive;
      }
      interface Wrapper {
        id: number;
        node?: Recursive;
      }
      return createBinaryEncoderFn<Wrapper>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const child: {name: string; next?: unknown} = {name: 'x'};
      child.next = child;
      return {id: 1, node: child};
    },
    expectThrows: true,
  },

  cycle_collapsed_noop_composite: {
    title: 'Cycle caught on a collapsed (noop short-form) mutate encoder',
    description:
      'A fully JSON-compatible circular TYPE is pj-noop (the cycle-as-identity ' +
      'fixpoint), so the jeMU composite ships as the noop short-form tuple and the ' +
      'runtime fn is native JSON.stringify. The armed guard must still wrap it — ' +
      'the short-form entry carries the runtype bundle SoftDep — and throw ' +
      'CircularReferenceError, NOT the native TypeError a bare JSON.stringify ' +
      'would raise on the cyclic value.',
    jsonEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createJsonEncoderFn<Node>(undefined, {strategy: 'mutate', rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {name: string; next?: unknown} = {name: 'a'};
      node.next = node;
      return node;
    },
    expectThrows: true,
  },

  cycle_mutual: {
    title: 'Mutual cycle across two types',
    jsonEncoder: () => {
      interface A {
        name: string;
        b?: B;
      }
      interface B {
        tag: string;
        a?: A;
      }
      return createJsonEncoderFn<A>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface A {
        name: string;
        b?: B;
      }
      interface B {
        tag: string;
        a?: A;
      }
      return createBinaryEncoderFn<A>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const a: {name: string; b?: unknown} = {name: 'a'};
      const b: {tag: string; a?: unknown} = {tag: 'b'};
      a.b = b;
      b.a = a;
      return a;
    },
    expectThrows: true,
  },

  dag_shared_acyclic: {
    title: 'Shared-but-acyclic DAG encodes without throwing',
    jsonEncoder: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const shared = {label: 'shared', children: [] as unknown[]};
      return {label: 'root', children: [shared, shared]};
    },
    expectThrows: false,
  },

  dag_multi_level_shared: {
    title: 'Deep diamond DAG (shared, multi-level) encodes without throwing',
    description:
      'Each level references the same child twice (`a === b`); acyclic, so both encoders must succeed. Pins the fully-explored memo — without it the guard re-walks each shared subtree per path (exponential).',
    jsonEncoder: () => {
      interface Node {
        name: string;
        a?: Node;
        b?: Node;
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        a?: Node;
        b?: Node;
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      // A diamond DAG: every node's `a` and `b` point at the SAME next node, so
      // the guard reaches each node by 2^depth paths. Kept shallow (the emitted
      // encoder that runs after the guard also re-serializes shared subtrees).
      let head: {name: string; a?: unknown; b?: unknown} = {name: 'leaf'};
      for (let i = 0; i < 5; i++) head = {name: 'n' + i, a: head, b: head};
      return head;
    },
    expectThrows: false,
  },

  reentrant_getter_walk: {
    title: 'A getter that re-enters another armed encoder cannot corrupt the walk',
    description:
      'Reading `a` runs a getter that synchronously encodes a DIFFERENT cyclic value with its own armed encoder (which throws, swallowed here); the outer cycle (via `b`) must still be caught. Pins the per-call walk state — shared closure state would let the inner walk clobber the outer stack/skeleton and miss the cycle (→ the real encoder recurses forever / throws the wrong error).',
    jsonEncoder: () => {
      interface Node {
        name: string;
        a?: Node;
        b?: Node;
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        a?: Node;
        b?: Node;
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      // A separate armed encoder over its own cyclic value, invoked from a getter
      // DURING the outer walk (walk order visits `a` before `b`). Its guard
      // detects the inner cycle and throws — swallowed here so only the isolation
      // of the outer walk state is under test.
      interface Inner {
        label: string;
        next?: Inner;
      }
      const innerCyclic: {label: string; next?: unknown} = {label: 'i'};
      innerCyclic.next = innerCyclic;
      const encodeInner = createJsonEncoderFn<Inner>(undefined, {rejectCircularRefs: true});
      const outer: {name: string; a?: unknown; b?: unknown} = {name: 'o'};
      Object.defineProperty(outer, 'a', {
        enumerable: true,
        get() {
          try {
            encodeInner(innerCyclic as Inner); // re-entrant armed walk (throws on its cycle)
          } catch {
            // the inner armed encoder throws CircularReferenceError on its own
            // cycle; swallow it so only the OUTER guard's correctness is asserted
          }
          return undefined; // `a` contributes nothing to the outer walk
        },
      });
      outer.b = outer; // the REAL cycle the outer guard must still catch
      return outer;
    },
    expectThrows: true,
  },

  disarmed_acyclic: {
    title: 'Disarmed guard leaves acyclic encoding unchanged',
    jsonEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createJsonEncoderFn<Node>();
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createBinaryEncoderFn<Node>();
    },
    getValue: () => ({name: 'a', next: {name: 'b'}}),
    expectThrows: false,
  },
} as const satisfies Record<string, CircularGuardSerializationCase>;
