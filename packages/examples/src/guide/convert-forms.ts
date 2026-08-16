import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, getRunTypeId, type InferType} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

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

// start-dialect
// Types JSON has no word for convert as plain data: extra keywords say what
// the JSON becomes in JavaScript, and the standard keywords beside them keep
// describing the JSON itself, so any validator can read the schema.
export const releaseRT = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    build: {type: 'string', const: '4096', jsType: 'bigint'},
    stamp: {type: 'string', format: 'date-time', jsType: 'Temporal.Instant'},
  },
  required: ['build', 'stamp'],
} as const);
export type Release = InferType<typeof releaseRT>;
// end-dialect

// start-call-sites
// A type written straight into a factory call has no declaration to rewrite,
// so the converter rewrites the call itself. Before:
export const isOrder = createValidateFn<{id: string; total: number}>();
// end-call-sites

// start-call-sites-after
// And after converting to type builders, the same call with the type as a
// value. It reflects the same shape, so it is the same validator.
export const isOrderBuilt = createValidateFn(RT.object({id: TF.string(), total: TF.number()}));
getRunTypeId<{id: string; total: number}>() === getRunTypeId(RT.object({id: TF.string(), total: TF.number()})); // true
// end-call-sites-after
