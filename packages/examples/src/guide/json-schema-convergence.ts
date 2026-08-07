import * as TF from '@ts-runtypes/core/formats';
import * as RT from '@ts-runtypes/core/builders';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

// start-convergence
// One shape, three ways to write it.
interface Point {
  name: string;
  x: number;
  y: number;
}

const typeFirst = createValidateFn<Point>();

const builderForm = createValidateFn(RT.object({name: TF.string(), x: TF.number(), y: TF.number()}));

const jsonSchemaForm = createValidateFn(
  runTypeFromJsonSchema({
    type: 'object',
    properties: {name: {type: 'string'}, x: {type: 'number'}, y: {type: 'number'}},
    required: ['name', 'x', 'y'],
  })
);

// Not three similar validators. The very same one: all three forms describe the
// same shape, so they land on the same generated function.
typeFirst === builderForm; // true
typeFirst === jsonSchemaForm; // true
// end-convergence

// start-ids
// The identity behind that is the type id, which is computed from the shape
// rather than from how you spelled it.
const idFromType = getRunTypeId<Point>();
const idFromSchema = getRunTypeId(
  runTypeFromJsonSchema({
    type: 'object',
    properties: {name: {type: 'string'}, x: {type: 'number'}, y: {type: 'number'}},
    required: ['name', 'x', 'y'],
  })
);

idFromType === idFromSchema; // true
// end-ids

export {typeFirst, builderForm, jsonSchemaForm, idFromType, idFromSchema};
export type {Point};
