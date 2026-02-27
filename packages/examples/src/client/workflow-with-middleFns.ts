import {initClient, routesFlow} from '@mionkit/client';
import {HeadersSubset} from '@mionkit/core';
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function routesFlowWithMiddleFns() {
    const authHeaders = new HeadersSubset({Authorization: 'my-token'});

    // Execute routesFlow with explicit middleFns
    const [[sum, user], [sumError, userError], middleFnResults, middleFnErrors] = await routesFlow(
        [routes.utils.sum(5, 2), routes.users.getById('USER-123')],
        {auth: middleFns.auth(authHeaders)}
    );

    // Check middleFn errors
    if (middleFnErrors?.auth) {
        console.log('Auth failed:', middleFnErrors.auth.publicMessage);
        return;
    }

    // Handle route results
    if (!sumError) console.log('Sum:', sum);
    if (!userError) console.log('User:', user);
}
