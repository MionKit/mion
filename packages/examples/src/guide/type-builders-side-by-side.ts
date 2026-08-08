import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import {runTypeFromJsonSchema, type FromJsonSchema, type JsonSchemaInput} from '@ts-runtypes/core/json-schema';

// start-type
// Option A — a plain TypeScript type. Fastest path, nothing extra to write.
type Product = {
  id: number;
  name: string;
  tags: string[];
  status: 'draft' | 'live';
};

const isProductA = createValidateFn<Product>();
// end-type

// start-builder
// Option B — the RT.* builders, if you like the Zod / TypeBox feel.
const productRunType = RT.object({
  id: TF.number(),
  name: TF.string(),
  tags: RT.array(TF.string()),
  status: RT.union([RT.literal('draft'), RT.literal('live')]),
});

// Recover the TypeScript type from the run-type whenever you need it.
type ProductFromRunType = InferType<typeof productRunType>;

const isProductB = createValidateFn(productRunType);
// end-builder

// start-json-schema
// Option C — a draft 2020-12 JSON Schema, handed over as-is.
const productJsonSchema = {
  type: 'object',
  properties: {
    id: {type: 'number'},
    name: {type: 'string'},
    tags: {type: 'array', items: {type: 'string'}},
    status: {enum: ['draft', 'live']},
  },
  required: ['id', 'name', 'tags', 'status'],
} as const satisfies JsonSchemaInput;

// The TypeScript type is recovered from the document, so nothing drifts.
type ProductFromJsonSchema = FromJsonSchema<typeof productJsonSchema>;

const isProductC = createValidateFn(runTypeFromJsonSchema(productJsonSchema));
// end-json-schema

export {isProductA, isProductB, isProductC};
export type {Product, ProductFromRunType, ProductFromJsonSchema};
