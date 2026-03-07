import {eq, inArray} from 'drizzle-orm';
import {getDb} from '../../db/client.ts';
import {ordersTable, orderEventsTable} from '../../db/schema.ts';
import {FormatUUIDv7} from '@mionkit/type-formats/StringFormats';
import {randomUUID_V7} from '@mionkit/core';
import {Order, OrderEvent} from './orders-models.ts';

export async function findAllOrders(): Promise<Order[]> {
    return (await getDb().select().from(ordersTable)) as Order[];
}

export async function findOrderById(id: FormatUUIDv7): Promise<Order | undefined> {
    const [order] = (await getDb().select().from(ordersTable).where(eq(ordersTable.id, id))) as Order[];
    return order;
}

export async function insertOrder(customer: string, total: number, id?: FormatUUIDv7): Promise<Order> {
    const [order] = await getDb()
        .insert(ordersTable)
        .values({
            id: id ?? (randomUUID_V7() as FormatUUIDv7),
            customer,
            total: Math.round(total * 100) / 100,
            status: 'pending' as const,
        })
        .returning();
    await getDb().insert(orderEventsTable).values({
        type: 'placed' as const,
        orderId: order.id,
        at: order.createdAt,
    });
    return order;
}

export async function findEventsByOrderId(orderId: FormatUUIDv7): Promise<OrderEvent[]> {
    return (await getDb().select().from(orderEventsTable).where(eq(orderEventsTable.orderId, orderId))) as OrderEvent[];
}

export async function findEventsByOrderIds(orderIds: FormatUUIDv7[]): Promise<OrderEvent[]> {
    return (await getDb()
        .select()
        .from(orderEventsTable)
        .where(inArray(orderEventsTable.orderId, orderIds))) as OrderEvent[];
}
