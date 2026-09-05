import {HeadersSubset} from '@mionjs/core';
import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './hello-sum-auth.routes.ts';

const {routes, middleFns} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const authHeaders = new HeadersSubset({Authorization: 'my-token'});

// Execute a batch with explicit middleware functions
const [[sum, greeting], [sumError, greetingError], fatal, , middleFnErrors] =
  await batch([routes.utils.sum(5, 2), routes.sayHello('John')]).call({
    middleFns: {auth: middleFns.auth(authHeaders)},
  });

// Each middleware function's declared errors arrive by name,
// anything undeclared surfaces once as fatal
if (middleFnErrors?.auth)
  console.log('Auth failed:', middleFnErrors.auth.publicMessage);
if (fatal) console.log('Request failed:', fatal.publicMessage);

// Handle route results
if (!sumError) console.log('Sum:', sum);
if (!greetingError) console.log(greeting);
