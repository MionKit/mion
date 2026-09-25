/* eslint-disable @typescript-eslint/no-unused-vars */
import {initClient} from '@mionjs/client';
import {HeadersSubset} from '@mionjs/core';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// sets the auth token before every request that runs the auth middleware
middlewares.auth.onRequest((auth) =>
  auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))
);

// calls the sum route in the server, auth data comes from onRequest
// Returns 5-tuple: [routeResult, routeError, undeclared, middlewareResults, middlewareErrors]
const [sumResult, sumError, undeclared, middlewareResults, middlewareErrors] =
  await routes.utils.sum(5, 2).call();
console.log(sumResult); // 7
console.log(sumError); // undefined (the route's DECLARED errors | ValidationError)
console.log(undeclared); // undefined (transport, platform, framework, or an undeclared throw)
console.log(middlewareResults); // { auth: ... }
console.log(middlewareErrors); // {} (each middleware's DECLARED errors, by id)

// validate parameters locally without calling the server
const validationResp = await routes.users
  .sayHello({id: '123', name: 'John', surname: 'Doe'})
  .typeErrors();
console.log(validationResp); // []
