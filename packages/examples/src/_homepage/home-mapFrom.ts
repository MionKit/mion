import {initClient, routesFlow, serverMapFrom} from '@mionjs/client';
import type {MyApi} from './home-server.ts';
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// @annotate: serverMapFrom order.userId → getUser input, (mapping function runs server-side)
const orderReq = routes.getOrder('ORDER-123');
const userIdMapping = serverMapFrom(orderReq, (order) => order!.userId);
const userReq = routes.getUser(userIdMapping.asArg());

const [[order, user]] = await routesFlow([orderReq, userReq]).call();
if (order && user) {
    console.log(`Order ${order.id} placed by ${user.name}`);
}
