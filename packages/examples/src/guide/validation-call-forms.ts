import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

type Point = {x: number; y: number};

// start-forms
// 1. Type-first: you supply the type, no value needed.
const isPointA = createValidateFn<Point>();

// 2. Value-first: T is inferred from a value you already have.
const origin: Point = {x: 0, y: 0};
const isPointB = createValidateFn(origin);

// 3. Run-type: pass the run-type an RT.* builder returned; T is inferred from it.
const pointRunType = RT.object({x: TF.number(), y: TF.number()});
const isPointC = createValidateFn(pointRunType);
// end-forms

// All three resolve to the same generated validator.
type PointFromRunType = InferType<typeof pointRunType>;

export {isPointA, isPointB, isPointC};
export type {PointFromRunType};
