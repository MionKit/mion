import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// returns a 5-tuple: [routeResult, routeError, undeclared, middlewareResults, middlewareErrors]
const [user, routeError, undeclared, middlewareResults, middlewareErrors] =
  await routes.users.getById('USER-123').call({
    middlewares: {
      auth: middlewares.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    },
  });

// routeError holds the route's declared errors, middlewareErrors each middleware's, by name
if (routeError?.type === 'user-not-found')
  console.log('missing:', routeError.errorData?.requestedId);
else if (middlewareErrors?.auth?.type === 'not-authorized')
  console.log('auth failed:', middlewareErrors.auth.errorData?.reason);
else if (undeclared) console.log('request failed:', undeclared.publicMessage);
else console.log(user?.name, middlewareResults); // John
