import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

type Point = {x: number; y: number};

// start-forms
// 1. Type-first — you supply the type, no value needed.
const isPointA = createValidateFn<Point>();

// 2. Value-first — T is inferred from a value you already have.
const origin: Point = {x: 0, y: 0};
const isPointB = createValidateFn(origin);

// 3. Run-type — pass the run-type an RT.* builder returned; T is inferred from it.
const pointRunType = RT.object({x: TF.number(), y: TF.number()});
const isPointC = createValidateFn(pointRunType);

// 4. JSON Schema — pass a draft 2020-12 literal; T is recovered from it.
const isPointD = createValidateFn(
  runTypeFromJsonSchema({type: 'object', properties: {x: {type: 'number'}, y: {type: 'number'}}, required: ['x', 'y']})
);
// end-forms

// All four resolve to the same generated validator.
type PointFromRunType = InferType<typeof pointRunType>;

export {isPointA, isPointB, isPointC, isPointD};
export type {PointFromRunType};
