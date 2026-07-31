import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const UTILITY_TYPES = {
  awaited: {
    title: 'Awaited',
    description:
      '`Awaited<Promise<T>>` unwraps the promise at the type level and resolves to the plain object `{a: string; b: number; c: Date}`, so the serializer sees only that resolved shape across JSON and binary.',
    serializeNotes: 'The unwrapped `c` is a Date — ISO string over JSON (revived `new Date`), 8-byte float64 epoch over binary.',
    mutateEncoder: () => createJsonEncoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    preserveDecoder: () =>
      createJsonDecoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    binaryDecoder: () => createBinaryDecoderFn<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    // Awaited<Promise<T>> resolves to T at the type-checker layer; the value-first
    // model is the resolved object shape (mirrors validation Native.awaited_promise,
    // which models Awaited<Promise<string>> as plain TF.string()).
    schemaEncoder: () => createJsonEncoderFn(RT.object({a: TF.string(), b: TF.number(), c: TF.date()})),
    schemaDecoder: () => createJsonDecoderFn(RT.object({a: TF.string(), b: TF.number(), c: TF.date()})),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.object({a: TF.string(), b: TF.number(), c: TF.date()})),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.object({a: TF.string(), b: TF.number(), c: TF.date()})),
    getTestData: () => ({values: [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  exclude_atomic: {
    title: 'Exclude',
    description:
      "`Exclude<'name' | 'age' | number, 'age'>` removes the `'age'` member from the atomic union, resolving to `'name' | number`, which round-trips identically across JSON and binary.",
    mutateEncoder: () => createJsonEncoderFn<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Exclude<'name' | 'age' | number, 'age'>>(),
    preserveDecoder: () => createJsonDecoderFn<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Exclude<'name' | 'age' | number, 'age'>>(),
    binaryDecoder: () => createBinaryDecoderFn<Exclude<'name' | 'age' | number, 'age'>>(),
    schemaEncoder: () =>
      createJsonEncoderFn(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), TF.number()]), RT.literal('age'))),
    schemaDecoder: () =>
      createJsonDecoderFn(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), TF.number()]), RT.literal('age'))),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), TF.number()]), RT.literal('age'))),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), TF.number()]), RT.literal('age'))),
    getTestData: () => ({values: ['name', 3, 4]}),
  },
  exclude_objects: {
    title: 'Exclude objects',
    description:
      '`Exclude<Shape, Circle>` drops the `Circle` member from the object union, resolving to the `Square | Triangle` discriminated union keyed on each `kind` literal, and since all fields are plain numbers/strings the round-trip is symmetric across JSON and binary.',
    mutateEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoderFn<Exclude<Shape, Circle>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoderFn<Exclude<Shape, Circle>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoderFn<Exclude<Shape, Circle>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoderFn<Exclude<Shape, Circle>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonDecoderFn<Exclude<Shape, Circle>>();
    },
    preserveDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonDecoderFn<Exclude<Shape, Circle>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonDecoderFn<Exclude<Shape, Circle>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createBinaryEncoderFn<Exclude<Shape, Circle>>();
    },
    binaryDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createBinaryDecoderFn<Exclude<Shape, Circle>>();
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ]),
          RT.object({kind: RT.literal('circle'), radius: TF.number()})
        )
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ]),
          RT.object({kind: RT.literal('circle'), radius: TF.number()})
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ]),
          RT.object({kind: RT.literal('circle'), radius: TF.number()})
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ]),
          RT.object({kind: RT.literal('circle'), radius: TF.number()})
        )
      ),
    getTestData: () => ({
      values: [
        {kind: 'square', x: 5},
        {kind: 'triangle', x: 5, y: 10},
      ],
    }),
  },
  required_properties: {
    title: 'Required',
    description:
      '`Required<{name?; age?; createdAt?: Date}>` strips optionality from every property, resolving to the all-required object `{name: string; age: number; createdAt: Date}` that the serializer then encodes as a mandatory shape across JSON and binary.',
    serializeNotes: [
      'Required<T> removes the `?` modifiers, so every property is expected on the wire — the wire shape carries no optional/absent slots.',
      'The mandatory `createdAt` Date round-trips via ISO string (JSON) / 8-byte float64 epoch (binary).',
    ],
    mutateEncoder: () =>
      createJsonEncoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    preserveDecoder: () =>
      createJsonDecoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    binaryDecoder: () => createBinaryDecoderFn<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.required(RT.object({name: RT.optional(TF.string()), age: RT.optional(TF.number()), createdAt: RT.optional(TF.date())}))
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.required(RT.object({name: RT.optional(TF.string()), age: RT.optional(TF.number()), createdAt: RT.optional(TF.date())}))
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.required(RT.object({name: RT.optional(TF.string()), age: RT.optional(TF.number()), createdAt: RT.optional(TF.date())}))
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.required(RT.object({name: RT.optional(TF.string()), age: RT.optional(TF.number()), createdAt: RT.optional(TF.date())}))
      ),
    getTestData: () => ({
      values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}],
    }),
  },
  extract_atomic: {
    title: 'Extract',
    description:
      "`Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>` keeps only the members of the atomic union assignable to the second argument, resolving to `'name' | 'createdAt'`, which round-trips identically across JSON and binary.",
    mutateEncoder: () =>
      createJsonEncoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    preserveDecoder: () =>
      createJsonDecoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    binaryDecoder: () => createBinaryDecoderFn<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    getTestData: () => ({values: ['name']}),
  },
  extract_objects: {
    title: 'Extract objects',
    description:
      '`Extract<Shape, ToExtract>` keeps the object-union members assignable to `ToExtract`, dropping `Circle` to resolve the `Square | Triangle` discriminated union, and since all fields are plain numbers/strings the round-trip is symmetric across JSON and binary.',
    mutateEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoderFn<Extract<Shape, ToExtract>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoderFn<Extract<Shape, ToExtract>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoderFn<Extract<Shape, ToExtract>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoderFn<Extract<Shape, ToExtract>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonDecoderFn<Extract<Shape, ToExtract>>();
    },
    preserveDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonDecoderFn<Extract<Shape, ToExtract>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonDecoderFn<Extract<Shape, ToExtract>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createBinaryEncoderFn<Extract<Shape, ToExtract>>();
    },
    binaryDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createBinaryDecoderFn<Extract<Shape, ToExtract>>();
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.extract(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ]),
          RT.union([
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ])
        )
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.extract(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ]),
          RT.union([
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ])
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.extract(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ]),
          RT.union([
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ])
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.extract(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: TF.number()}),
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ]),
          RT.union([
            RT.object({kind: RT.literal('square'), x: TF.number()}),
            RT.object({kind: RT.literal('triangle'), x: TF.number(), y: TF.number()}),
          ])
        )
      ),
    getTestData: () => ({values: [{kind: 'square', x: 5}]}),
  },
  partial_properties: {
    title: 'Partial',
    description:
      '`Partial<{name; age; createdAt: Date}>` makes every property optional, resolving to `{name?: string; age?: number; createdAt?: Date}`, with samples covering each property in isolation plus the empty object so omitted optional slots simply do not appear on the wire.',
    serializeNotes: [
      'Partial<T> adds the `?` modifier to each property, so absent properties are omitted from the JSON/binary output and stay absent after the round-trip.',
      'When present, the optional `createdAt` Date round-trips via ISO string (JSON) / 8-byte float64 epoch (binary).',
    ],
    mutateEncoder: () =>
      createJsonEncoderFn<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoderFn<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoderFn<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoderFn<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Partial<{name: string; age: number; createdAt: Date}>>(),
    preserveDecoder: () =>
      createJsonDecoderFn<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoderFn<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Partial<{name: string; age: number; createdAt: Date}>>(),
    binaryDecoder: () => createBinaryDecoderFn<Partial<{name: string; age: number; createdAt: Date}>>(),
    schemaEncoder: () => createJsonEncoderFn(RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}))),
    schemaDecoder: () => createJsonDecoderFn(RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}))),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}))),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(RT.partial(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date()}))),
    getTestData: () => {
      const createdAt = new Date('2000-08-06T02:13:00.000Z');
      return {values: [{name: 'John'}, {age: 30}, {createdAt}, {}]};
    },
  },
  pick_properties: {
    title: 'Pick',
    description:
      "`Pick<{name; age; createdAt: Date; email}, 'name' | 'createdAt'>` keeps only the selected keys, resolving to `{name: string; createdAt: Date}`, so the dropped `age`/`email` are not part of the resolved shape and never appear on the wire.",
    serializeNotes:
      'The kept `createdAt` Date round-trips via ISO string (JSON) / 8-byte float64 epoch (binary); the unpicked `age`/`email` are absent from the resolved type and the wire.',
    mutateEncoder: () =>
      createJsonEncoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'direct',
      }),
    compactEncoder: () =>
      createJsonEncoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'compact',
      }),
    stripDecoder: () =>
      createJsonDecoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    preserveDecoder: () =>
      createJsonDecoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'preserve',
      }),
    compactDecoder: () =>
      createJsonDecoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'compact',
      }),
    binaryEncoder: () =>
      createBinaryEncoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    binaryDecoder: () =>
      createBinaryDecoderFn<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date(), email: TF.string()}), ['name', 'createdAt'])
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date(), email: TF.string()}), ['name', 'createdAt'])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date(), email: TF.string()}), ['name', 'createdAt'])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.pick(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date(), email: TF.string()}), ['name', 'createdAt'])
      ),
    getTestData: () => ({values: [{name: 'John', createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  omit_properties: {
    title: 'Omit',
    description:
      "`Omit<{name; age; createdAt: Date; email}, 'email'>` removes the `email` key, resolving to the email-less shape `{name: string; age: number; createdAt: Date}` that the serializer sees across JSON and binary.",
    serializeNotes:
      'The kept `createdAt` Date round-trips via ISO string (JSON) / 8-byte float64 epoch (binary); the omitted `email` is absent from the resolved type and the wire.',
    mutateEncoder: () =>
      createJsonEncoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'direct',
      }),
    compactEncoder: () =>
      createJsonEncoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'compact',
      }),
    stripDecoder: () => createJsonDecoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    preserveDecoder: () =>
      createJsonDecoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'preserve',
      }),
    compactDecoder: () =>
      createJsonDecoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'compact',
      }),
    binaryEncoder: () => createBinaryEncoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    binaryDecoder: () => createBinaryDecoderFn<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.omit(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date(), email: TF.string()}), ['email'])
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.omit(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date(), email: TF.string()}), ['email'])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.omit(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date(), email: TF.string()}), ['email'])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.omit(RT.object({name: TF.string(), age: TF.number(), createdAt: TF.date(), email: TF.string()}), ['email'])
      ),
    getTestData: () => ({values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  record_type: {
    title: 'Record',
    description:
      '`Record<string, Date>` resolves to an object with a `string` index signature whose values are Date, accepting arbitrary string keys and round-tripping each Date value, with the empty object as a boundary sample.',
    serializeNotes:
      'Each index-signature value is a Date — ISO string over JSON (revived `new Date`), 8-byte float64 epoch over binary; keys pass through unchanged.',
    mutateEncoder: () => createJsonEncoderFn<Record<string, Date>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Record<string, Date>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<Record<string, Date>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<Record<string, Date>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<Record<string, Date>>(),
    preserveDecoder: () => createJsonDecoderFn<Record<string, Date>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<Record<string, Date>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<Record<string, Date>>(),
    binaryDecoder: () => createBinaryDecoderFn<Record<string, Date>>(),
    // Record<string, V> — value-only builder; the key defaults to string (mirrors
    // validation Object.ts string-keyed record cases using RT.record(<value>)).
    schemaEncoder: () => createJsonEncoderFn(RT.record(TF.date())),
    schemaDecoder: () => createJsonDecoderFn(RT.record(TF.date())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.record(TF.date())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.record(TF.date())),
    getTestData: () => ({
      values: [
        {
          key1: new Date('2000-08-06T02:13:00.000Z'),
          key2: new Date('2001-09-07T03:14:00.000Z'),
        },
        {},
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
