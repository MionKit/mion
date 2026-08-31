import type * as TF from '@mionjs/run-types/formats';

export interface Order {
  total: TF.Currency<{max: 10000}>;
}
