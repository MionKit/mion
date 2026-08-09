import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import {getRunTypeId, type InferType} from '@ts-runtypes/core';
import {embedType, runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

// start-before
// A file you might have today, written type-first.
export type User = {
  id: number;
  name?: string;
  tags: string[];
};
// end-before

// start-after-builders
// The same declaration after `ts-runtypes convert --to builders`: the const
// carries the shape, and the alias keeps the type name alive so nothing that
// imported `User` breaks.
export const userRT = RT.object({id: TF.number(), name: RT.optional(TF.string()), tags: RT.array(TF.string())});
export type UserAsBuilders = InferType<typeof userRT>;
// end-after-builders

// start-after-schema
// And after `ts-runtypes convert --to json-schema`.
export const userSchemaRT = runTypeFromJsonSchema({
  type: 'object',
  properties: {id: {type: 'number'}, name: {type: 'string'}, tags: {type: 'array', items: {type: 'string'}}},
  required: ['id', 'tags'],
} as const);
export type UserAsSchema = InferType<typeof userSchemaRT>;
// end-after-schema

// start-identity
// Conversion never moves a type's identity: all three spellings resolve to
// the same id, so they share one generated validator, codec and mock pool.
getRunTypeId<User>() === getRunTypeId(userRT); // true
getRunTypeId<User>() === getRunTypeId(userSchemaRT); // true
// end-identity

// start-embed
// Some TypeScript types have no JSON spelling (a bigint literal, a function,
// a branded string). The converter carries them with embedType, which drops
// a real type into a schema position, so the round trip stays exact.
export const auditRT = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    version: embedType<123n>(),
    onSave: embedType<(entry: string) => void>(),
  },
  required: ['version'],
} as const);
type Audit = InferType<typeof auditRT>;
const sample: Audit = {version: 123n};
getRunTypeId(sample) === getRunTypeId(auditRT); // true
// end-embed
