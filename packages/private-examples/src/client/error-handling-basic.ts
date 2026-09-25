import {initClient} from '@mionjs/client';
import type {MyApi} from './error-basic.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// call() never throws, errors come back in the tuple
const [user, error] = await routes.users.getById('123').call();

if (error?.type === 'user-not-found') {
  // the route's own error, narrowed by its type
  console.log('no user with that id');
} else if (error) {
  // a validation error, or anything else that failed
  console.log('call failed:', error.publicMessage);
} else {
  console.log('User:', user?.name);
}
