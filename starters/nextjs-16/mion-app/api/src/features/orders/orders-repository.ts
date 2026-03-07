import {randomUUID_V7} from '@mionkit/core';
import {FormatUUIDv7} from '@mionkit/type-formats/StringFormats';
import {Order, OrderEvent} from './orders-models.ts';

// ---- In-memory store with seed data ----

const id1 = randomUUID_V7() as FormatUUIDv7;
const id2 = randomUUID_V7() as FormatUUIDv7;
const id3 = randomUUID_V7() as FormatUUIDv7;

const orders: Order[] = [
    {
        id: id1,
        customer: 'Alice Johnson',
        total: 175.97,
        status: 'delivered',
        createdAt: new Date('2025-03-01T10:00:00Z'),
    },
    {
        id: id2,
        customer: 'Bob Smith',
        total: 79.99,
        status: 'shipped',
        createdAt: new Date('2025-03-05T14:30:00Z'),
    },
    {
        id: id3,
        customer: 'Carol Davis',
        total: 106.96,
        status: 'cancelled',
        createdAt: new Date('2025-03-07T09:15:00Z'),
    },
];

const events: OrderEvent[] = [
    {type: 'placed', orderId: id1, at: new Date('2025-03-01T10:00:00Z')},
    {type: 'paid', orderId: id1, at: new Date('2025-03-01T10:05:00Z'), method: 'credit_card'},
    {type: 'shipped', orderId: id1, at: new Date('2025-03-02T08:00:00Z'), carrier: 'FedEx', tracking: 'FX-123456'},
    {type: 'delivered', orderId: id1, at: new Date('2025-03-04T15:30:00Z')},
    {type: 'placed', orderId: id2, at: new Date('2025-03-05T14:30:00Z')},
    {type: 'paid', orderId: id2, at: new Date('2025-03-05T14:35:00Z'), method: 'paypal'},
    {type: 'shipped', orderId: id2, at: new Date('2025-03-06T10:00:00Z'), carrier: 'UPS', tracking: 'UPS-789012'},
    {type: 'placed', orderId: id3, at: new Date('2025-03-07T09:15:00Z')},
    {type: 'cancelled', orderId: id3, at: new Date('2025-03-07T09:45:00Z'), reason: 'Customer changed their mind'},
];

export function findAllOrders(): Order[] {
    return orders;
}

export function findOrderById(id: FormatUUIDv7): Order | undefined {
    return orders.find((o) => o.id === id);
}

export function insertOrder(customer: string, total: number, id?: FormatUUIDv7): Order {
    const order: Order = {
        id: id ?? (randomUUID_V7() as FormatUUIDv7),
        customer,
        total: Math.round(total * 100) / 100,
        status: 'pending',
        createdAt: new Date(),
    };
    orders.push(order);
    events.push({type: 'placed', orderId: order.id, at: order.createdAt});
    return order;
}

export function findEventsByOrderId(orderId: FormatUUIDv7): OrderEvent[] {
    return events.filter((e) => e.orderId === orderId);
}

export function findEventsByOrderIds(orderIds: FormatUUIDv7[]): OrderEvent[] {
    const idSet = new Set(orderIds);
    return events.filter((e) => idSet.has(e.orderId));
}
