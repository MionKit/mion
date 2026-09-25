// start-setup
import {initClient} from '@mionjs/client';
import {useSyncRoutes} from '@mionjs/client/middlewares';
import type {MyApi} from './sync-routes.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
useSyncRoutes(middlewares.mionSyncRoutes);
// end-setup

// start-mismatch
const [greeting, , undeclared] = await routes.sayHello('Ana').call();

// the server's route types changed since this app was built
if (undeclared?.type === 'route-types-mismatch') location.reload();
else console.log(greeting);
// end-mismatch
