import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes, middleFns} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// the same call, reading all five slots
const [user, error, undeclared, middleFnResults, middleFnErrors] =
  await routes.users.getById('USER-123').call({
    middleFns: {
      auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    },
  });

// the route's own declared errors
if (error) console.log('route error:', error.type);
// a timeout, a network drop, anything nobody declared
if (undeclared) console.log('undeclared:', undeclared.type);
// each middleware function's declared errors and results, by name
if (middleFnErrors?.auth) console.log('auth error:', middleFnErrors.auth.type);
console.log(user?.name, middleFnResults);
