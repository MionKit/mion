// `createJsonSchemaFn<T>()` — returns a function producing the JSON Schema document for `T`. The
// document is rendered at BUILD time by the Go schemadoc renderer and ships as the `jsonSchema` (jsc)
// cache entry this factory resolves; the runtime only post-processes it (see jsonSchemaDoc.ts). The
// returned callable takes the same options as the `~standard.jsonSchema` converter methods and returns
// the identical document.

import {isRunTypeValue} from '../runtypes/rtUtils.ts';
import {resolveEntryTupleFn} from '../runtypes/entryTuple.ts';
import type {EntryTuple} from '../runtypes/entryTuple.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectTypeFnArgs} from '../markers.ts';
import type {StandardJSONSchemaOptions} from './spec.ts';
import {buildJsonSchemaConverter} from './jsonSchemaDoc.ts';
import type {JsonSchemaDocFn} from './jsonSchemaDoc.ts';

/** The callable `createJsonSchemaFn<T>()` returns. **/
export type JsonSchemaFn = (options?: StandardJSONSchemaOptions) => Record<string, unknown>;

// No-plugin fallback: with no reflection graph injected for T there is nothing to derive a document
// from, so this throws with the standard guidance instead of returning a silently-wrong `{}`.
export const jsonSchemaDocFallback: JsonSchemaDocFn = () => {
  throw new Error(
    'createJsonSchemaFn(): no compiled schema document. @mionjs/devtools must be active for the jsonSchema cache entry to exist.'
  );
};

/** Accepts either a value-first `RunType` schema or the type/value reflection form, like `createValidateFn`. **/
export function createJsonSchemaFn<T>(runType: RunType<T>, ids?: InjectTypeFnArgs<T, 'jsonSchema'>): JsonSchemaFn;
export function createJsonSchemaFn<T>(val?: T, ids?: InjectTypeFnArgs<T, 'jsonSchema'>): JsonSchemaFn;
export function createJsonSchemaFn<T>(valOrSchema?: T | RunType<T>, ids?: InjectTypeFnArgs<T, 'jsonSchema'>): JsonSchemaFn {
  // A value-first schema's runtime `.id` overrides the injected type id, correct even for recursive schemas.
  const runTypeId = isRunTypeValue(valOrSchema) ? valOrSchema.id : undefined;
  const docFn = resolveEntryTupleFn<JsonSchemaDocFn>(
    'createJsonSchemaFn',
    jsonSchemaDocFallback,
    runTypeId,
    ids as unknown as EntryTuple
  );
  return buildJsonSchemaConverter(docFn).input;
}
