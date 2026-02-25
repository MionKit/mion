import {initClient, routesFlow, mapFrom} from '@mionkit/client';
import type {MyApi} from './server.routes.ts';

const {routes, linkedFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function mapFromExample() {
    // Fetch an order, then automatically fetch the user who placed it
    const order = routes.orders.getById('ORDER-123');
    // mapFrom maps order.userId → getById input, (runs server-side)
    const mapping = mapFrom(order, (o) => o!.userId);
    // fake is just used for faking the expected type of getById in the client
    const preference = routes.users.getById(mapping.fake());
    const [[orderData, userData]] = await routesFlow([order, preference]);

    if (orderData && userData) {
        console.log(`Order ${orderData.id} placed by ${userData.name} ${userData.surname}`);
    }
}
