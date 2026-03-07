import {toDrizzlePGTable} from '@mionkit/drizzle';
import {uuid, timestamp} from 'drizzle-orm/pg-core';
import {Order, OrderEvent} from '../features/orders/orders-models.ts';

export const ordersTable = toDrizzlePGTable<Order>('orders', {
    id: uuid('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderEventsTable = toDrizzlePGTable<OrderEvent>('order_events', {
    orderId: uuid('order_id')
        .references(() => ordersTable.id)
        .notNull(),
    at: timestamp('at').defaultNow().notNull(),
});
