import {initClient} from '@mionjs/client';
import type {MyApi} from './query-mutation.routes.ts';

const {routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// a GET, so it is cheap to cancel and easy to cache
const [user] = await routes.getUser('USER-123').call();

const [created] = await routes.createUser('Jane').call();

console.log(user?.name, created?.id);
