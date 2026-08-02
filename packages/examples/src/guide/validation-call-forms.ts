import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

type Point = {x: number; y: number};

// start-forms
// 1. Type-first — you supply the type, no value needed.
const isPointA = createValidateFn<Point>();

// 2. Value-first — T is inferred from a value you already have.
const origin: Point = {x: 0, y: 0};
const isPointB = createValidateFn(origin);

// 3. Schema-first — pass an RT.* schema; T is inferred from the schema.
const pointSchema = RT.object({x: TF.number(), y: TF.number()});
const isPointC = createValidateFn(pointSchema);

// 4. JSON Schema — pass a draft 2020-12 literal; T is recovered from it.
const isPointD = createValidateFn(
  runTypeFromJsonSchema({type: 'object', properties: {x: {type: 'number'}, y: {type: 'number'}}, required: ['x', 'y']})
);
// end-forms

// All four resolve to the same generated validator.
type PointFromSchema = InferType<typeof pointSchema>;

export {isPointA, isPointB, isPointC, isPointD};
export type {PointFromSchema};
