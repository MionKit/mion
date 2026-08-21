import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionjs/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// calls route with auth middleFn
// Returns 4-tuple: [routeResult, routeError, unexpected, middleFnResults]
const [user, routeError, unexpected, middleFnResults] = await routes.users.getById('123').call({
    middleFns: {
        auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    },
});

// routeError is the route's DECLARED errors; a failing middleFn (e.g. auth) surfaces in `unexpected`
if (routeError || unexpected) {
    console.log('Something failed');
} else {
    console.log(user); // User object
}
