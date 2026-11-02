import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

export const orders = DZ.pgTable('orders', {
  id: DZ.uuid({version: '7', primaryKey: true}), // UUIDv7 field, default uuidv7() (PostgreSQL 18)
  status: DZ.text({enum: ['pending', 'shipped'], notNull: true}),
  trackingCode: DZ.varchar('tracking_code', {length: 40}),
});

type OrderRow = InferSelectModel<typeof orders>;
type OrderBase = Omit<OrderRow, 'status' | 'trackingCode'>;

// a union has no table form: write it by hand from the row type
export type Order =
  | (OrderBase & {status: 'pending'; trackingCode: null})
  | (OrderBase & {
      status: 'shipped';
      trackingCode: NonNullable<OrderRow['trackingCode']>;
    });

// compile error if the union stops fitting the table
export const toRow = (order: Order): OrderRow => order;

export const validateOrder = createValidateFn<Order>(); // a shipped order needs its tracking code
