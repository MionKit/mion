import {initClient, batch, inputFrom} from '@mionjs/client';
import type {MyApi} from './batch-orders.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// Fetch an order
const orderReq = routes.orders.getById('ORDER-123');
// inputFrom maps order.userId -> getById input, (runs server-side)
const mapping = inputFrom(orderReq, (order) => order!.userId);
// asArg() is a typed placeholder for the value the server will map in
const userReq = routes.users.getById(mapping.asArg());

const [[orderData, userData]] = await batch([orderReq, userReq]).call();
if (orderData && userData) {
  console.log(`Order ${orderData.id} placed by ${userData.name}`);
}
