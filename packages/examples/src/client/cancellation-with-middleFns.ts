import {HeadersSubset} from '@mionjs/core';
import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './hello-sum-auth.routes.ts';

const {routes, middleFns} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const controller = new AbortController();

// cancellation works with middleware functions
const [greeting, , fatal] = await routes.sayHello('John').call({
  middleFns: {
    auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
  },
  timeout: 5000,
  signal: controller.signal,
});
if (!fatal) console.log(greeting);

// and with a batch
const [[sum, greeting2], [sumError, greetingError]] = await batch([
  routes.utils.sum(5, 2),
  routes.sayHello('Jane'),
]).call({
  middleFns: {
    auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
  },
  timeout: 10_000,
});
if (!sumError && !greetingError) console.log(sum, greeting2);
