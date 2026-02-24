import {initClient, routesFlow} from '@mionkit/client';
import {HeadersSubset} from '@mionkit/core';
import type {MyApi} from './server.routes.ts';

const {routes, linkedFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function routesFlowWithLinkedFns() {
    const authHeaders = new HeadersSubset({Authorization: 'my-token'});

    // Execute routesFlow with explicit linkedFns
    const [[sum, user], [sumError, userError], linkedFnResults, linkedFnErrors] = await routesFlow(
        [routes.utils.sum(5, 2), routes.users.getById('USER-123')],
        {auth: linkedFns.auth(authHeaders)}
    );

    // Check linkedFn errors
    if (linkedFnErrors?.auth) {
        console.log('Auth failed:', linkedFnErrors.auth.publicMessage);
        return;
    }

    // Handle route results
    if (!sumError) console.log('Sum:', sum);
    if (!userError) console.log('User:', user);
}
