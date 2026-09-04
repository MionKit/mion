import {initClient} from '@mionjs/client';
import type {ErrorBasicApi} from './error-basic.routes.ts';

const {routes} = initClient<ErrorBasicApi>({baseURL: 'http://localhost:3000'});

// call() never throws, errors come back in the tuple
const [user, error] = await routes.users.getById('123').call();

if (error) {
  // TypeScript knows error.type is 'user-not-found' | 'validation-error'
  console.log('Error:', error.publicMessage);
} else {
  console.log('User:', user?.name);
}
