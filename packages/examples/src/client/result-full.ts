import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const [user, error, undeclared, middlewareResults, middlewareErrors] =
  await routes.users.getById('USER-123').call({
    middlewares: {
      auth: middlewares.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    },
  });

// the route's own declared errors
if (error) console.log('route error:', error.type);
// a timeout, a network drop, anything nobody declared
if (undeclared) console.log('undeclared:', undeclared.type);
// each middleware's declared errors and results, by name
if (middlewareErrors?.auth)
  console.log('auth error:', middlewareErrors.auth.type);
console.log(user?.name, middlewareResults);
