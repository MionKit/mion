import {initClient} from '@mionjs/client';
import type {MyApi} from './hello.routes.ts';

// every request times out after 10 seconds
const {routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
  timeout: 10_000,
});

// uses the 10s default timeout
const [greeting] = await routes.sayHello('John').call();
console.log(greeting);

// 2s for this call only; a timeout comes back in @thrownErrors
const [, , response] = await routes.sayHello('Jane').call({timeout: 2000});
if (response['@thrownErrors']?.[0].type === 'request-timeout')
  console.log('too slow');
