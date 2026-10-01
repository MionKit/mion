import {initClient} from '@mionjs/client';
import type {MyApi} from './hello.routes.ts';

// off by default
const {routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
  validateServerResponses: true,
});

// a wrong answer is dropped and reported in @thrownErrors
const [greeting, error, response] = await routes.sayHello('John').call();
const [thrown] = response['@thrownErrors'] ?? [];

if (thrown?.type === 'response-validation-error') console.log(thrown.errorData);
else console.log(greeting, error);
