import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionkit/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// calls route with auth middleFn
// Returns 4-tuple: [routeResult, routeError, middleFnsResults, middleFnsErrors]
const [user, routeError, middleFnResults, middleFnErrors] = await routes.users.getById('123').callWithMiddleFns({
    auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
});

if (routeError || middleFnErrors?.auth) {
    console.log('Something failed');
} else {
    console.log(user); // User object
}
