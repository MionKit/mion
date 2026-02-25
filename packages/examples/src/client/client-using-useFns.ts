import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionkit/core';

const {routes, useFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function callWithUseFns() {
    // calls route with auth useFn
    // Returns 4-tuple: [routeResult, routeError, useFnsResults, useFnsErrors]
    const [user, routeError, useFnResults, useFnErrors] = await routes.users.getById('123').callWithUseFns({
        auth: useFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    });

    if (routeError || useFnErrors?.auth) {
        console.log('Something failed');
    } else {
        console.log(user); // User object
    }
}
