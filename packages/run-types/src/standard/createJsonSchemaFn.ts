// `createJsonSchemaFn<T>()` — returns a function producing the JSON Schema
// document for `T`. The document was rendered at BUILD time (the Go schemadoc
// renderer) and ships as the `jsonSchema` (jsc) cache entry this factory
// resolves through its trailing `InjectTypeFnArgs<T, 'jsonSchema'>` marker;
// the runtime only post-processes: `target` is checked and
// `libraryOptions: {portable: true}` strips the RunTypes dialect keywords
// (see jsonSchemaDoc.ts).
//
// The returned callable is the same shape the `~standard.jsonSchema`
// converter methods take, so `createJsonSchemaFn<T>()(options)` and
// `createStandardSchema<T>()['~standard'].jsonSchema.input(options)` return
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

// No-plugin fallback: without the plugin no reflection graph was injected for T,
// so there is nothing to derive a document from — resolving without a compiled
// entry throws with the standard guidance instead of returning a silently-wrong
// `{}`. (Consuming an ALREADY-resolved graph at runtime is fine — the mocking
// walker does exactly that — the missing piece here is obtaining one.)
export const jsonSchemaDocFallback: JsonSchemaDocFn = () => {
  throw new Error(
    'createJsonSchemaFn(): no compiled schema document. ts-runtypes-devtools must be active for the jsonSchema cache entry to exist.'
  );
};

/** Returns the JSON Schema document fn for `T`. Accepts either a value-first
 *  `RunType` schema or the type/value reflection form, mirroring
 *  `createValidateFn`. **/
export function createJsonSchemaFn<T>(runType: RunType<T>, ids?: InjectTypeFnArgs<T, 'jsonSchema'>): JsonSchemaFn;
export function createJsonSchemaFn<T>(val?: T, ids?: InjectTypeFnArgs<T, 'jsonSchema'>): JsonSchemaFn;
export function createJsonSchemaFn<T>(valOrSchema?: T | RunType<T>, ids?: InjectTypeFnArgs<T, 'jsonSchema'>): JsonSchemaFn {
  // A value-first schema's runtime `.id` overrides the injected type id
  // (correct even for recursive schemas), same as createStandardSchema.
  const runTypeId = isRunTypeValue(valOrSchema) ? valOrSchema.id : undefined;
  const docFn = resolveEntryTupleFn<JsonSchemaDocFn>(
    'createJsonSchemaFn',
    jsonSchemaDocFallback,
    runTypeId,
    ids as unknown as EntryTuple
  );
  return buildJsonSchemaConverter(docFn).input;
}
