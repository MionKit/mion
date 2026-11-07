// Circular-REFERENCE section: recursive types fed values with a reference cycle. mion validates with
// `{rejectCircularRefs: true}`, paying the cycle walk and REJECTING the cyclic `invalid` samples; a competitor
// matches it with one root check walking the same recursive path, on top of its normal schema.
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
