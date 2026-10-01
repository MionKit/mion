import {HeadersSubset} from '@mionjs/core';
import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './hello-sum-auth.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// runs once per batch, so the whole batch shares one trace id
middlewares.trace.onRequest((trace) =>
  trace(new HeadersSubset({'X-Trace-Id': crypto.randomUUID()}))
);

const [
  [sum, greeting],
  [sumError, greetingError],
  undeclared,
  middlewareResults,
  middlewareErrors,
] = await batch([routes.utils.sum(5, 2), routes.sayHello('John')]).call();

// declared middleware errors arrive by id, anything else once as undeclared
if (middlewareErrors?.auth)
  console.log('Auth failed:', middlewareErrors.auth.publicMessage);
if (middlewareResults?.trace) console.log('Trace:', middlewareResults.trace);
if (undeclared) console.log('Request failed:', undeclared.publicMessage);

if (!sumError) console.log('Sum:', sum);
if (!greetingError) console.log(greeting);
