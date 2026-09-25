import {HeadersSubset} from '@mionjs/core';
import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './hello-sum-auth.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const controller = new AbortController();
middlewares.auth.onRequest((auth) =>
  auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))
);

// cancellation works with middleware
const [greeting, , undeclared] = await routes.sayHello('John').call({
  timeout: 5000,
  signal: controller.signal,
});
if (!undeclared) console.log(greeting);

// and with a batch
const [[sum, greeting2], [sumError, greetingError]] = await batch([
  routes.utils.sum(5, 2),
  routes.sayHello('Jane'),
]).call({timeout: 10_000});
if (!sumError && !greetingError) console.log(sum, greeting2);
