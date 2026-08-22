import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionjs/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// calls route with auth middleFn
// Returns 5-tuple: [routeResult, routeError, fatal, middleFnResults, middleFnErrors]
const [user, routeError, fatal, middleFnResults, middleFnErrors] = await routes.users.getById('123').call({
    middleFns: {
        auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    },
});

// routeError is the route's DECLARED errors; each middleFn's declared errors arrive by name
if (routeError || fatal || middleFnErrors?.auth) {
    console.log('Something failed');
} else {
    console.log(user); // User object
}
