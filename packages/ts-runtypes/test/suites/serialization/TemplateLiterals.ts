import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const TEMPLATE_LITERALS = {
  url_string: {
    title: 'Root template literal',
    description:
      'Root template-literal type `` `api/users/${number}` `` round-trips identically across JSON and binary as a plain string, with samples covering integer, negative, fractional, and max-safe-integer interpolations.',
    serializeNotes:
      'A template literal is a string subtype on the wire — no pattern-specific transform applies; it serializes exactly like a `string`.',
    mutateEncoder: () => createJsonEncoderFn<`api/users/${number}`>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<`api/users/${number}`>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<`api/users/${number}`>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<`api/users/${number}`>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<`api/users/${number}`>(),
    preserveDecoder: () => createJsonDecoderFn<`api/users/${number}`>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<`api/users/${number}`>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<`api/users/${number}`>(),
    binaryDecoder: () => createBinaryDecoderFn<`api/users/${number}`>(),
    schemaEncoder: () => createJsonEncoderFn(RT.templateLiteral(['api/users/', TF.number()])),
    schemaDecoder: () => createJsonDecoderFn(RT.templateLiteral(['api/users/', TF.number()])),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.templateLiteral(['api/users/', TF.number()])),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.templateLiteral(['api/users/', TF.number()])),
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
  },
  url_in_object: {
    title: 'Template literal property',
    description:
      'Object with a template-literal-typed `url` property plus a plain `method: string` round-trips identically across JSON and binary as plain strings.',
    mutateEncoder: () => createJsonEncoderFn<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{url: `api/user/${number}`; method: string}>(),
    preserveDecoder: () => createJsonDecoderFn<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{url: `api/user/${number}`; method: string}>(),
    binaryDecoder: () => createBinaryDecoderFn<{url: `api/user/${number}`; method: string}>(),
    schemaEncoder: () =>
      createJsonEncoderFn(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
    schemaDecoder: () =>
      createJsonDecoderFn(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
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
      'Record whose index-signature key is a template literal `` `api/${string}` `` with `number` values round-trips as a plain key/value object across JSON and binary, including the empty-object case.',
    serializeNotes:
      'The template-literal key constrains which property names are valid but is not encoded separately — entries serialize as ordinary string-keyed members.',
    mutateEncoder: () => createJsonEncoderFn<{[key: `api/${string}`]: number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{[key: `api/${string}`]: number}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{[key: `api/${string}`]: number}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{[key: `api/${string}`]: number}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{[key: `api/${string}`]: number}>(),
    preserveDecoder: () => createJsonDecoderFn<{[key: `api/${string}`]: number}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{[key: `api/${string}`]: number}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{[key: `api/${string}`]: number}>(),
    binaryDecoder: () => createBinaryDecoderFn<{[key: `api/${string}`]: number}>(),
    schemaEncoder: () => createJsonEncoderFn(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
    schemaDecoder: () => createJsonDecoderFn(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
    getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
  },
  url_index_key_with_named: {
    title: 'Index key with named sibling',
    description:
      'Object combining a template-literal-keyed index signature (`` `api/${string}` `` → `string | number`) with a sibling named `meta: string` resolves to an intersection of the keyed record and an object carrying the named prop, round-tripping as a plain object across JSON and binary.',
    mutateEncoder: () =>
      createJsonEncoderFn<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoderFn<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoderFn<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{meta: string; [key: `api/${string}`]: string | number}>(),
    preserveDecoder: () =>
      createJsonDecoderFn<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{meta: string; [key: `api/${string}`]: string | number}>(),
    binaryDecoder: () => createBinaryDecoderFn<{meta: string; [key: `api/${string}`]: string | number}>(),
    // Index signature + sibling named prop = intersection of the template-literal-keyed
    // record with an object carrying the named props (mirrors validation Object.ts
    // index_signature_named_props composed with the template-literal index key).
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.intersection(
          RT.record(RT.templateLiteral(['api/', TF.string()]), RT.union([TF.string(), TF.number()])),
          RT.object({meta: TF.string()})
        )
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.intersection(
          RT.record(RT.templateLiteral(['api/', TF.string()]), RT.union([TF.string(), TF.number()])),
          RT.object({meta: TF.string()})
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.intersection(
          RT.record(RT.templateLiteral(['api/', TF.string()]), RT.union([TF.string(), TF.number()])),
          RT.object({meta: TF.string()})
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.intersection(
          RT.record(RT.templateLiteral(['api/', TF.string()]), RT.union([TF.string(), TF.number()])),
          RT.object({meta: TF.string()})
        )
      ),
    getTestData: () => ({
      values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
