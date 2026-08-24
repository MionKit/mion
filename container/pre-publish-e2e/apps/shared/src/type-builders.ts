// Family 2 — type ⇄ builder duality. Mirrors guide/type-builders-*.ts.
// A plain type and the RT.* builders resolve to the SAME validator, and
// InferType<typeof runType> recovers the TypeScript type.
import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import {type CheckResult, ok} from './check';

// Type-first.
export interface Product {
  id: number;
  name: string;
  tags: string[];
  status: 'draft' | 'live';
}
export const isProductTypeFirst = createValidateFn<Product>();

// Builders — the same shape as a run-type value.
export const productRunType = RT.object({
  id: TF.number(),
  name: TF.string(),
  tags: RT.array(TF.string()),
  status: RT.union([RT.literal('draft'), RT.literal('live')]),
});
export const isProductBuilder = createValidateFn(productRunType);

// InferType maps the run-type back to a usable TypeScript type.
export type ProductFromRunType = InferType<typeof productRunType>;
const home: ProductFromRunType = {id: 1, name: 'Widget', tags: ['a'], status: 'live'};

export function checkTypeBuilders(): CheckResult[] {
  const good: Product = {id: 1, name: 'Widget', tags: ['a', 'b'], status: 'draft'};
  const bad = {id: 'x', name: 5, tags: 'nope', status: 'archived'};
  return [
    ok('duality: type-first validator accepts a good value', isProductTypeFirst(good)),
    ok('duality: builder validator accepts a good value', isProductBuilder(good)),
    ok('duality: both reject a bad value', !isProductTypeFirst(bad) && !isProductBuilder(bad)),
    // Behavioral convergence: the type-first and builder forms agree on the same
    // inputs, for both a good and a bad value — the type ⇄ builder duality.
    ok('duality: type-first and builder validators agree (good)', isProductTypeFirst(good) === isProductBuilder(good)),
    ok('duality: type-first and builder validators agree (bad)', isProductTypeFirst(bad) === isProductBuilder(bad)),
    ok('duality: InferType<typeof runType> is a usable type', home.status === 'live'),
  ];
}
