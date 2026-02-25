import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionkit/core';

const {routes, linkedFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function callWithLinkedFns() {
    // calls route with auth linkedFn
    // Returns 4-tuple: [routeResult, routeError, linkedFnsResults, linkedFnsErrors]
    const [user, routeError, linkedFnResults, linkedFnErrors] = await routes.users.getById('123').callWithLinkedFns({
        auth: linkedFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    });

    if (routeError || linkedFnErrors?.auth) {
        console.log('Something failed');
    } else {
        console.log(user); // User object
    }
}
