import {initClient, batch, inputFrom} from '@mionjs/client';
import type {MyApi} from './home-server.ts';
const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// @annotate: inputFrom maps order.userId → getUser input, (mapping function runs server-side)
const orderReq = routes.getOrder('ORDER-123');
const userIdMapping = inputFrom(orderReq, (order) => order!.userId);
const userReq = routes.getUser(userIdMapping.asArg());

const [[order, user]] = await batch([orderReq, userReq]).call();
if (order && user) {
  console.log(`Order ${order.id} placed by ${user.name}`);
}
