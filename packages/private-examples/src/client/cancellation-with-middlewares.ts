import {HeadersSubset} from '@mionjs/core';
import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './hello-sum-auth.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const controller = new AbortController();
middlewares.trace.onRequest((trace) =>
  trace(new HeadersSubset({'X-Trace-Id': crypto.randomUUID()}))
);

// cancellation works with middleware
const [greeting, , response] = await routes.sayHello('John').call({
  timeout: 5000,
  signal: controller.signal,
});
if (!response['@thrownErrors']) console.log(greeting);

// and with a batch
const [[sum, greeting2], [sumError, greetingError]] = await batch([
  routes.utils.sum(5, 2),
  routes.sayHello('Jane'),
]).call({timeout: 10_000});
if (!sumError && !greetingError) console.log(sum, greeting2);
