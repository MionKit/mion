import {getDb} from './client.ts';
import {ordersTable, orderEventsTable} from './schema.ts';

/** Seeds the database with sample order data. Run with: npx vite-node src/db/seed.ts */
async function seed() {
    console.log('Seeding database...');

    // Clean existing data
    await getDb().delete(orderEventsTable);
    await getDb().delete(ordersTable);

    // Insert orders
    const [order1, order2, order3] = await getDb()
        .insert(ordersTable)
        .values([
            {
                customer: 'Alice Johnson',
                total: 175.97,
                status: 'delivered' as const,
            },
            {
                customer: 'Bob Smith',
                total: 79.99,
                status: 'shipped' as const,
            },
            {
                customer: 'Carol Davis',
                total: 106.96,
                status: 'cancelled' as const,
            },
        ])
        .returning();

    // Insert order events
    await getDb().insert(orderEventsTable).values([
        {type: 'placed' as const, orderId: order1.id, at: new Date('2025-03-01T10:00:00Z')},
        {type: 'paid' as const, orderId: order1.id, at: new Date('2025-03-01T10:05:00Z'), method: 'credit_card'},
        {
            type: 'shipped' as const,
            orderId: order1.id,
            at: new Date('2025-03-02T08:00:00Z'),
            carrier: 'FedEx',
            tracking: 'FX-123456',
        },
        {type: 'delivered' as const, orderId: order1.id, at: new Date('2025-03-04T15:30:00Z')},
        {type: 'placed' as const, orderId: order2.id, at: new Date('2025-03-05T14:30:00Z')},
        {type: 'paid' as const, orderId: order2.id, at: new Date('2025-03-05T14:35:00Z'), method: 'paypal'},
        {
            type: 'shipped' as const,
            orderId: order2.id,
            at: new Date('2025-03-06T10:00:00Z'),
            carrier: 'UPS',
            tracking: 'UPS-789012',
        },
        {type: 'placed' as const, orderId: order3.id, at: new Date('2025-03-07T09:15:00Z')},
        {
            type: 'cancelled' as const,
            orderId: order3.id,
            at: new Date('2025-03-07T09:45:00Z'),
            reason: 'Customer changed their mind',
        },
    ]);

    console.log('Seeded 3 orders with events.');
}

seed().catch(console.error);
