import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, getRunTypeId, type InferType} from '@ts-runtypes/core';
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
// A few types have no way to be written as data at all, because their identity
// is a name rather than a shape: a class, an enum member, another declaration
// being referred to. The converter carries those with embedType, which drops a
// real type into a schema position, so the round trip stays exact.
export class AuditSource {
  constructor(public label: string) {}
}

export const auditRT = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    source: embedType<AuditSource>(),
    onSave: embedType<(entry: string, note?: string) => void>(),
  },
  required: ['source'],
} as const);
type Audit = InferType<typeof auditRT>;
const sample: Audit = {source: new AuditSource('cli')};
getRunTypeId(sample) === getRunTypeId(auditRT); // true
// end-embed

// start-dialect
// Most of what JSON has no word for still converts as plain data, through extra
// keywords RunTypes adds beside the standard ones. Each says what the JSON
// becomes in JavaScript; the standard keywords still describe the JSON itself,
// so any validator can read these.
export const releaseRT = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    build: {type: 'string', const: '4096', jsType: 'bigint'},
    channel: {tsTemplate: {texts: ['release/', ''], placeholders: [{type: 'string'}]}},
    stamp: {type: 'string', format: 'date-time', jsType: 'Temporal.Instant'},
    notify: {
      tsFunction: {
        params: {type: 'array', prefixItems: [{type: 'string'}], minItems: 1, items: false, tsLabels: ['message']},
        return: {type: 'boolean'},
      },
    },
  },
  required: ['build', 'channel', 'stamp', 'notify'],
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
