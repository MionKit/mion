// start-setup
import {isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import {useSyncRoutes} from '@mionjs/client/middlewares';
import type {MyApi} from './sync-routes.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
// once, next to initClient
useSyncRoutes(middlewares.mionSyncRoutes);
// end-setup

// start-mismatch
const [greeting, , response] = await routes.sayHello('Ana').call();
const syncError = response.mionSyncRoutes;

// the route's types changed on the server since this app was built
if (isRpcError(syncError) && syncError.type === 'route-types-mismatch')
  location.reload();
else console.log(greeting);
// end-mismatch
