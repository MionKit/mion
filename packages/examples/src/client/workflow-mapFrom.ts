import {initClient, routesFlow, serverMapFrom} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';
const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// Fetch an order
const orderReq = routes.orders.getById('ORDER-123');
// serverMapFrom maps order.userId → getById input, (runs server-side)
const mapping = serverMapFrom(orderReq, (order) => order!.userId);
// fake is just used for faking the expected type of users.getById in the client
const userReq = routes.users.getById(mapping.asArg());

const [[orderData, userData]] = await routesFlow([orderReq, userReq]).call();
if (orderData && userData) {
    console.log(`Order ${orderData.id} placed by ${userData.name} ${userData.surname}`);
}
