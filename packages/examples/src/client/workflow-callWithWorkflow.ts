import {initClient} from '@mionkit/client';
import {HeadersSubset} from '@mionkit/core';
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function callWithWorkflowExample() {
    const authHeaders = new HeadersSubset({Authorization: 'my-token'});

    // Alternative syntax: start from a route and add more routes to the routesFlow
    const [[sum, user, order], [sumError, userError, orderError]] = await routes.utils
        .sum(5, 2)
        .callWithWorkflow([routes.users.getById('USER-123'), routes.orders.getById('ORDER-1')], {
            auth: middleFns.auth(authHeaders),
        });

    // Handle results - same array pattern as routesFlow()
    if (!sumError) console.log('Sum:', sum);
    if (!userError) console.log('User:', user);
    if (!orderError) console.log('Order:', order);
}
