import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';

// start-type
// Option A: a plain TypeScript type. Fastest path, nothing extra to write.
type Product = {
  id: number;
  name: string;
  tags: string[];
  status: 'draft' | 'live';
};

const isProductA = createValidateFn<Product>();
// end-type

// start-builder
// Option B: the RT.* builders, if you like the Zod / TypeBox feel.
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

export {isProductA, isProductB};
export type {Product, ProductFromRunType};
