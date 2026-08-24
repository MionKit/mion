// Circular-reference GUARD cases for the format-validation suite. The guard
// keys on container kinds, not branded leaves, so a recursive type carrying a
// formatted leaf (a uuid string) behaves exactly like the plain validation
// cases — proving the guard is format-agnostic. Minimal coverage: one cyclic
// case + one acyclic DAG control.

import type * as TF from '@ts-runtypes/core/formats';
import {createGetValidationErrorsFn, createValidateFn} from '@ts-runtypes/core';
import '@ts-runtypes/core/formats';
import type {CircularGuardValidationCase} from '../../util/circularGuardAsserts.ts';

const UUID_V4 = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

export const CIRCULAR_GUARD = {
  cycle_with_format_leaf: {
    title: 'Cycle through an object carrying a uuid leaf',
    validate: () => {
      interface Node {
        id: TF.UUIDv4;
        next?: Node;
      }
      return createValidateFn<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        id: TF.UUIDv4;
        next?: Node;
      }
      const inference: Node = {id: UUID_V4};
      return createValidateFn(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        id: TF.UUIDv4;
        next?: Node;
      }
      return createGetValidationErrorsFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        id: TF.UUIDv4;
        next?: Node;
      }
      const inference: Node = {id: UUID_V4};
      return createGetValidationErrorsFn(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {id: string; next?: unknown} = {id: UUID_V4};
      node.next = node;
      return node;
    },
    expectValid: false,
  },

  dag_with_format_leaf: {
    title: 'Shared-but-acyclic DAG with uuid leaves validates',
    validate: () => {
      interface Node {
        id: TF.UUIDv4;
        children: Node[];
      }
      return createValidateFn<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        id: TF.UUIDv4;
        children: Node[];
      }
      const inference: Node = {id: UUID_V4, children: []};
      return createValidateFn(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        id: TF.UUIDv4;
        children: Node[];
      }
      return createGetValidationErrorsFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        id: TF.UUIDv4;
        children: Node[];
      }
      const inference: Node = {id: UUID_V4, children: []};
      return createGetValidationErrorsFn(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const shared = {id: UUID_V4, children: [] as unknown[]};
      return {id: UUID_V4, children: [shared, shared]};
    },
    expectValid: true,
  },
} as const satisfies Record<string, CircularGuardValidationCase>;
