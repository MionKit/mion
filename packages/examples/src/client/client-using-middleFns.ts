import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes, middleFns} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// calls a route passing data to the auth middleware function
// Returns 5-tuple: [routeResult, routeError, fatal, middleFnResults, middleFnErrors]
const [user, routeError, fatal, middleFnResults, middleFnErrors] =
  await routes.users.getById('USER-123').call({
    middleFns: {
      auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    },
  });

// routeError holds the route's DECLARED errors, each middleware
// function's declared errors arrive by name
if (routeError?.type === 'user-not-found')
  console.log('missing:', routeError.errorData?.requestedId);
else if (middleFnErrors?.auth?.type === 'not-authorized')
  console.log('auth failed:', middleFnErrors.auth.errorData?.reason);
else if (fatal) console.log('request failed:', fatal.publicMessage);
else console.log(user?.name, middleFnResults); // John
