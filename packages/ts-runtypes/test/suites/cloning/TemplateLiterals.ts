// cloning / TemplateLiterals — template-literal string types are primitives
// at runtime: root-level values pass through by value like any string.
// Objects and records KEYED by template-literal patterns clone normally —
// keys matching the pattern are declared shape (copied onto a fresh
// object), while non-matching keys are undeclared and drop by
// construction.

import {createCloneExactShapeFn} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

export const TEMPLATE_LITERALS = {
  url_string: {
    title: 'Root template literal',
    description:
      'A root `` `api/users/${number}` `` value is a plain string at runtime — a primitive with no identity to refresh, so it passes through by value.',
    clone: () => createCloneExactShapeFn<`api/users/${number}`>(),
    getTestData: () => ({
      values: [
        'api/users/0',
        'api/users/1',
        'api/users/42',
        'api/users/-7',
        'api/users/3.14',
        `api/users/${Number.MAX_SAFE_INTEGER}`,
      ],
    }),
    passThrough: true,
  },
  url_in_object: {
    title: 'Template literal property',
    description:
      'An object with a template-literal-typed `url` plus a plain `method: string` rebuilds as a fresh object whose string props are shared by value.',
    clone: () => createCloneExactShapeFn<{url: `api/user/${number}`; method: string}>(),
    getTestData: () => ({
      values: [
        {url: 'api/user/1', method: 'GET'},
        {url: 'api/user/42', method: 'POST'},
        {url: 'api/user/-7', method: 'DELETE'},
      ],
    }),
  },
  url_index_key: {
    title: 'Template literal index key',
    description:
      'A record keyed by `` `api/${string}` `` copies its pattern-matching entries onto a fresh object (they ARE the declared shape, including the empty-object case); non-matching keys would drop by construction.',
    clone: () => createCloneExactShapeFn<{[key: `api/${string}`]: number}>(),
    getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
  },
  url_index_key_with_named: {
    title: 'Index key with named sibling',
    description:
      'A template-literal index signature (`` `api/${string}` `` → `string | number`) plus a named `meta: string` sibling clones onto one fresh object — the named prop is assigned and the pattern-matching keys are copied.',
    clone: () => createCloneExactShapeFn<{meta: string; [key: `api/${string}`]: string | number}>(),
    getTestData: () => ({
      values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
    }),
  },
} satisfies Record<string, CloningCase>;
