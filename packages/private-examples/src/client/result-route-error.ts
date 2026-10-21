import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// strongly typed: the route's own result or error
const [user, error] = await routes.users.getById('USER-404').call();

if (error)
  console.log(error.type); // 'user-not-found' | 'validation-error'
else if (user) console.log(user.name); // John
