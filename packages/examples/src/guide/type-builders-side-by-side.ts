import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

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

// Recover the TypeScript type, then generate from the type. Used this way
// the schema itself adds nothing to your bundle.
type ProductFromRunType = InferType<typeof productRunType>;

const isProductB = createValidateFn<ProductFromRunType>();
// end-builder

export {isProductA, isProductB};
export type {Product, ProductFromRunType};
