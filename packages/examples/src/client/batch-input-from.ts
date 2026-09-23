import {initClient, batch, inputFrom} from '@mionjs/client';
import type {MyApi} from './batch-orders.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const orderReq = routes.orders.getById('ORDER-123');
// feeds order.userId into the user route's input
const mapping = inputFrom(orderReq, (order) => order!.userId);
// a typed placeholder for the value the server maps in
const userReq = routes.users.getById(mapping.asArg());

const [[orderData, userData]] = await batch([orderReq, userReq]).call();
if (orderData && userData) {
  console.log(`Order ${orderData.id} placed by ${userData.name}`);
}
