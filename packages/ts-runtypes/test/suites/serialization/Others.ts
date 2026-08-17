import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import type {SerializationCase} from './types.ts';

export const OTHERS = {
  promise_jsonStringify_error: {
    title: 'Root Promise',
    description:
      'A root `Promise<string>` is non-serializable, so the Go pipeline renders the factory as alwaysThrow and every encoder / decoder invocation throws.',
    serializeNotes: [
      'No value-first builder exists for Promise, so all schema variants are not-supported.',
      'Binary shares the same alwaysThrow contract; test data is empty since the factory throws before any round-trip.',
    ],
    mutateEncoder: () => createJsonEncoderFn<Promise<string>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Promise<string>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Promise<string>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Promise<string>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Promise<string>>(),
    preserveDecoder: () => createJsonDecoderFn<Promise<string>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Promise<string>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Promise<string>>(),
    binaryDecoder: () => createBinaryDecoderFn<Promise<string>>(),
    // Promise has no value-first builder and is non-serializable.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  non_serializable: {
    title: 'Root Int8Array',
    description:
      'A root `Int8Array` is non-serializable, so the factory renders as alwaysThrow and every encoder / decoder invocation throws for both JSON and binary.',
    serializeNotes:
      'No value-first builder exists for Int8Array, so all schema variants are not-supported and test data is empty.',
    mutateEncoder: () => createJsonEncoderFn<Int8Array>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Int8Array>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Int8Array>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Int8Array>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Int8Array>(),
    preserveDecoder: () => createJsonDecoderFn<Int8Array>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Int8Array>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Int8Array>(),
    binaryDecoder: () => createBinaryDecoderFn<Int8Array>(),
    // Int8Array has no value-first builder and is non-serializable.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  non_serializable_interface: {
    title: 'Int8Array in interface',
    description:
      'An interface member of a directly non-serializable type (`Int8Array`) is DROPPED, matching `DataOnly<{a: Int8Array}>` = `{}`: every encoder serializes the remaining shape and the member round-trips away (a build-time …015 Warning flags the drop). This differs from a non-serializable ARRAY / TUPLE slot, which propagates and alwaysThrows.',
    serializeNotes: [
      'The `a` member is directly DataOnly-stripped, so it is dropped from the serialized form across every strategy. The mutate path `delete`s it so `JSON.stringify` cannot leak the typed array as a plain object — its output matches clone / direct / binary.',
      'No value-first builder can express the `Int8Array` member, so the schema variants stay not-supported.',
    ],
    mutateEncoder: () => createJsonEncoderFn<{a: Int8Array}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<{a: Int8Array}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<{a: Int8Array}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<{a: Int8Array}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<{a: Int8Array}>(),
    preserveDecoder: () => createJsonDecoderFn<{a: Int8Array}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<{a: Int8Array}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<{a: Int8Array}>(),
    binaryDecoder: () => createBinaryDecoderFn<{a: Int8Array}>(),
    // No value-first builder for Int8Array, so the enclosing object is inexpressible.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    // `a` is dropped, so every value round-trips to `{}` (the data-only projection).
    getTestData: () => ({values: [{a: new Int8Array([1, 2, 3])}], deserializedValues: [{}]}),
  },
  non_serializable_array: {
    title: 'Int8Array in array',
    description:
      'An array of non-serializable `Int8Array` elements renders the factory as alwaysThrow because a non-serializable element is a propagating position, so every encoder / decoder invocation throws for both JSON and binary.',
    serializeNotes:
      'No value-first builder can express the enclosing array, so all schema variants are not-supported and test data is empty.',
    mutateEncoder: () => createJsonEncoderFn<Int8Array[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Int8Array[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Int8Array[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Int8Array[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Int8Array[]>(),
    preserveDecoder: () => createJsonDecoderFn<Int8Array[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Int8Array[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Int8Array[]>(),
    binaryDecoder: () => createBinaryDecoderFn<Int8Array[]>(),
    // No value-first builder for Int8Array, so the enclosing array is inexpressible.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  non_serializable_tuple: {
    title: 'Int8Array in tuple',
    description:
      'A tuple with a non-serializable `Int8Array` slot renders the factory as alwaysThrow because a non-serializable tuple slot is a propagating position, so every encoder / decoder invocation throws for both JSON and binary.',
    serializeNotes:
      'No value-first builder can express the enclosing tuple, so all schema variants are not-supported and test data is empty.',
    mutateEncoder: () => createJsonEncoderFn<[Int8Array]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<[Int8Array]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<[Int8Array]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<[Int8Array]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<[Int8Array]>(),
    preserveDecoder: () => createJsonDecoderFn<[Int8Array]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<[Int8Array]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<[Int8Array]>(),
    binaryDecoder: () => createBinaryDecoderFn<[Int8Array]>(),
    // No value-first builder for Int8Array, so the enclosing tuple is inexpressible.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
} as const satisfies Record<string, SerializationCase>;
