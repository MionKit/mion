import {initClient, routesFlow, mapFrom} from '@mionkit/client';
import type {MyApi} from './home-server.ts';
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// @annotate: mapFrom order.userId → getUser input, (mapping function runs server-side)
const orderReq = routes.getOrder('ORDER-123');
const userIdMapping = mapFrom(orderReq, (order) => order!.userId).type();
const userReq = routes.getUser(userIdMapping);

const [[order, user]] = await routesFlow([orderReq, userReq]);
if (order && user) {
    console.log(`Order ${order.id} placed by ${user.name}`);
}
