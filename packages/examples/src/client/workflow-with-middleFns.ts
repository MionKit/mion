import {initClient, routesFlow} from '@mionjs/client';
import {HeadersSubset} from '@mionjs/core';
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const authHeaders = new HeadersSubset({Authorization: 'my-token'});

// Execute routesFlow with explicit middleFns
const [[sum, user], [sumError, userError], fatal, middleFnResults, middleFnErrors] = await routesFlow([
    routes.utils.sum(5, 2),
    routes.users.getById('USER-123'),
]).call({middleFns: {auth: middleFns.auth(authHeaders)}});

// Each middleFn's declared errors arrive by name; anything undeclared surfaces once as fatal
if (middleFnErrors?.auth) {
    console.log('Auth failed:', middleFnErrors.auth.publicMessage);
}
if (fatal) {
    console.log('Request failed:', fatal.publicMessage);
}

// Handle route results
if (!sumError) console.log('Sum:', sum);
if (!userError) console.log('User:', user);
