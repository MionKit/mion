import {initClient} from '@mionjs/client';
import type {HelloApi} from './hello.routes.ts';

// all requests timeout after 10 seconds unless overridden per-request
const {routes} = initClient<HelloApi>({
  baseURL: 'http://localhost:3000',
  timeout: 10_000,
});

// uses the 10s default timeout
const [greeting] = await routes.sayHello('John').call();
console.log(greeting);

// overrides to 2s for this specific call; a timeout surfaces in the fatal slot
const [, , timeoutErr] = await routes.sayHello('Jane').call({timeout: 2000});
if (timeoutErr?.type === 'request-timeout') console.log('too slow');
