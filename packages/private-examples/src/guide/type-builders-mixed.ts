import * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

type Money = {amount: number; currency: 'USD' | 'EUR'};

// the Money shape again, written with builders
const invoice = RT.object({
  id: TF.string(),
  lines: RT.array(
    RT.object({
      sku: TF.string(),
      total: RT.object({
        amount: TF.number(),
        currency: RT.union([RT.literal('USD'), RT.literal('EUR')]),
      }),
    })
  ),
});

const isMoney = createValidateFn<Money>();
const isInvoice = createValidateFn(invoice);

export {isMoney, isInvoice};
