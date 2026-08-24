import type * as TF from '@ts-runtypes/core/formats';

export interface Order {
  total: TF.Currency<{max: 10000}>;
}
