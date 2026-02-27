import {initClient, routesFlow} from '@mionkit/client';
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function basicRoutesFlow() {
    // Execute multiple routes in a single HTTP request
    const [[sum, user], [sumError, userError]] = await routesFlow([routes.utils.sum(5, 2), routes.users.getById('USER-123')]);

    // Results are returned as arrays in the same order as the routes
    if (sumError) console.log('Sum error:', sumError.publicMessage);
    else console.log('Sum:', sum); // 7

    if (userError) console.log('User error:', userError.publicMessage);
    else console.log('User:', user); // {id: 'USER-123', name: 'John', surname: 'Smith'}
}
