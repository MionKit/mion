// Circular-REFERENCE benchmark section: recursive types fed runtime values that
// contain a reference cycle. ts-runtypes builds its validators with the
// per-call `{rejectCircularRefs: true}` option (so it pays the cycle-detection walk
// and REJECTS the cyclic `invalid` samples); the other competitors have no
// cyclic-value detection (a cycle would stack-overflow them), so they declare
// these cases NOT_SUPPORTED. `valid` samples are acyclic instances of the same
// recursive type; `invalid` samples close a reference loop.
import type {SharedCase} from '../types.ts';

export const CIRCULAR_REFS = {
  linked_list_cycle: {
    title: 'Linked list — reference cycle rejected',
    description:
      'Recursive `{value: number; next: Node | null}`. Acyclic chains validate; a value whose `next` loops back is rejected as a reference cycle.',
    getSamples: () => {
      const twoStep: any = {value: 1, next: {value: 2, next: null}};
      twoStep.next.next = twoStep;
      const selfRef: any = {value: 9, next: null};
      selfRef.next = selfRef;
      return {
        valid: [
          {value: 1, next: null},
          {value: 1, next: {value: 2, next: {value: 3, next: null}}},
        ],
        invalid: [twoStep, selfRef],
      };
    },
  },

  tree_cycle: {
    title: 'Tree — child cycles back to an ancestor',
    description:
      'Recursive `{label: string; children: Node[]}`. Acyclic trees validate; a child that references an ancestor (or the node itself) is rejected.',
    getSamples: () => {
      const backEdge: any = {label: 'root', children: []};
      backEdge.children.push({label: 'child', children: [backEdge]});
      const selfInArray: any = {label: 'r', children: []};
      selfInArray.children.push(selfInArray);
      return {
        valid: [
          {label: 'leaf', children: []},
          {
            label: 'root',
            children: [
              {label: 'a', children: []},
              {label: 'b', children: [{label: 'c', children: []}]},
            ],
          },
        ],
        invalid: [backEdge, selfInArray],
      };
    },
  },

  object_self_cycle: {
    title: 'Self-referential object — reference cycle rejected',
    description:
      'Recursive `{name: string; next?: Node}`. Acyclic nestings validate; `a.next = a` (or a two-step loop) is rejected.',
    getSamples: () => {
      const selfRef: any = {name: 'a'};
      selfRef.next = selfRef;
      const twoStep: any = {name: 'a', next: {name: 'b'}};
      twoStep.next.next = twoStep;
      return {
        valid: [{name: 'a'}, {name: 'a', next: {name: 'b', next: {name: 'c'}}}],
        invalid: [selfRef, twoStep],
      };
    },
  },
} as const satisfies Record<string, SharedCase>;
