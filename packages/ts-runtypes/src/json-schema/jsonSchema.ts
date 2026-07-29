// The `jsonSchema` builder — a draft 2020-12 schema literal as a first-class
// RunTypes input. The whole trick is the existing value-first builder contract:
// a function whose trailing param is `InjectRunTypeId<T>` is a marker site, and
// the Go scanner reflects WHATEVER `T` resolves to at the call site. So
// `jsonSchema(s)` brands `FromJsonSchema<S>` — the type-level translation of the
// schema literal — and the entire factory surface (createValidateFn /
// createGetValidationErrorsFn / createMockDataFn / encoders) works with ZERO
// Go-side changes, converging on the same structural id as the hand-written
// type-first equivalent.

import {builderResult} from '../runtypes/builderCore.ts';
import type {CompTimeArgs, InjectRunTypeId} from '../markers.ts';
import type {RunType} from '../runtypes/types.ts';
import type {ExactJsonSchema, FromJsonSchema, JsonSchemaInput} from './fromJsonSchema.ts';

/** A JSON Schema (draft 2020-12 subset) as a first-class RunTypes input:
 *  `jsonSchema({type: 'object', …})` → `RunType<FromJsonSchema<S>>`, usable
 *  everywhere a value-first schema is (`createValidateFn(jsonSchema(s))`, mock,
 *  encoders, `getRunTypeId`). The schema literal rides `CompTimeArgs` (it must be
 *  fully static — same rule as every builder config; `as const` module consts
 *  work); `ExactJsonSchema` rejects unknown keywords at every nesting level; the
 *  reflected type comes from the trailing brand, so the runtime value is never
 *  consulted. The boolean overload covers 2020-12's boolean schemas at root:
 *  `jsonSchema(true)` → `unknown` (always-true), `jsonSchema(false)` → `never`. **/
export function jsonSchema<const S extends boolean>(
  schema: CompTimeArgs<S>,
  id?: InjectRunTypeId<FromJsonSchema<S>>
): RunType<FromJsonSchema<S>>;
export function jsonSchema<const S extends JsonSchemaInput>(
  schema: CompTimeArgs<ExactJsonSchema<S>>,
  id?: InjectRunTypeId<FromJsonSchema<S>>
): RunType<FromJsonSchema<S>>;
export function jsonSchema(schema: JsonSchemaInput | boolean, id?: InjectRunTypeId<unknown>): RunType<unknown> {
  return builderResult(id, {type: 'jsonSchema', schema});
}
