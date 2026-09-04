import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {HelloSumAuthApi} from './hello-sum-auth.routes.ts';

const {routes, middleFns} = initClient<HelloSumAuthApi>({baseURL: 'http://localhost:3000'});

const authHeaders = new HeadersSubset({Authorization: 'my-token'});

// Alternative syntax: start from a route and add more routes to the routesFlow
const [[sum, greeting], [sumError, greetingError]] = await routes.utils.sum(5, 2).call({
  otherRoutes: [routes.sayHello('John')],
  middleFns: {auth: middleFns.auth(authHeaders)},
});

// Handle results - same array pattern as routesFlow()
if (!sumError) console.log('Sum:', sum);
if (!greetingError) console.log(greeting);
