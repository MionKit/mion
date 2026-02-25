import {initClient, routesFlow} from '@mionkit/client';
import {HeadersSubset} from '@mionkit/core';
import type {MyApi} from './server.routes.ts';

const {routes, useFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function routesFlowWithUseFns() {
    const authHeaders = new HeadersSubset({Authorization: 'my-token'});

    // Execute routesFlow with explicit useFns
    const [[sum, user], [sumError, userError], useFnResults, useFnErrors] = await routesFlow(
        [routes.utils.sum(5, 2), routes.users.getById('USER-123')],
        {auth: useFns.auth(authHeaders)}
    );

    // Check useFn errors
    if (useFnErrors?.auth) {
        console.log('Auth failed:', useFnErrors.auth.publicMessage);
        return;
    }

    // Handle route results
    if (!sumError) console.log('Sum:', sum);
    if (!userError) console.log('User:', user);
}
