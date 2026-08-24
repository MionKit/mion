// Circular-reference GUARD cases for the format-serialization suite. As with
// format-validation, the guard is format-agnostic: a recursive type with a
// branded (uuid) leaf throws/encodes exactly like the plain serialization
// cases. Minimal coverage: one cyclic case + one acyclic DAG control.

import type * as TF from '@ts-runtypes/core/formats';
import {createBinaryEncoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import '@ts-runtypes/core/formats';
import type {CircularGuardSerializationCase} from '../../util/circularGuardAsserts.ts';

const UUID_V4 = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

export const CIRCULAR_GUARD = {
  cycle_with_format_leaf: {
    title: 'Cycle through an object carrying a uuid leaf',
    jsonEncoder: () => {
      interface Node {
        id: TF.UUIDv4;
        next?: Node;
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        id: TF.UUIDv4;
        next?: Node;
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {id: string; next?: unknown} = {id: UUID_V4};
      node.next = node;
      return node;
    },
    expectThrows: true,
  },

  dag_with_format_leaf: {
    title: 'Shared-but-acyclic DAG with uuid leaves encodes',
    jsonEncoder: () => {
      interface Node {
        id: TF.UUIDv4;
        children: Node[];
      }
      return createJsonEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        id: TF.UUIDv4;
        children: Node[];
      }
      return createBinaryEncoderFn<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const shared = {id: UUID_V4, children: [] as unknown[]};
      return {id: UUID_V4, children: [shared, shared]};
    },
    expectThrows: false,
  },
} as const satisfies Record<string, CircularGuardSerializationCase>;
