import {initClient} from '@mionjs/client';
import type {MyApi} from './hello.routes.ts';

// off by default
const {routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
  validateServerResponses: true,
});

// a wrong answer is dropped and reported in the third slot
const [greeting, error, undeclared] = await routes.sayHello('John').call();

if (undeclared?.type === 'response-validation-error')
  console.log(undeclared.errorData);
else console.log(greeting, error);
