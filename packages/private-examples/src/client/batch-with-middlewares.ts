import {HeadersSubset, isRpcError} from '@mionjs/core';
import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './hello-sum-auth.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// runs once per batch, so the whole batch shares one trace id
middlewares.trace.onRequest((trace) =>
  trace(new HeadersSubset({'X-Trace-Id': crypto.randomUUID()}))
);

const [[sum, greeting], [sumError, greetingError], response] = await batch([
  routes.utils.sum(5, 2),
  routes.sayHello('John'),
]).call();

// one response for the whole batch: middleware answers at their path, untyped errors in @thrownErrors
if (isRpcError(response.auth))
  console.log('Auth failed:', response.auth.publicMessage);
if (response.trace) console.log('Trace:', response.trace);
if (response['@thrownErrors'])
  console.log('Request failed:', response['@thrownErrors'][0].publicMessage);

if (!sumError) console.log('Sum:', sum);
if (!greetingError) console.log(greeting);
