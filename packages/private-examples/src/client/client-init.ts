import {initClient} from '@mionjs/client';

import type {MyApi} from './init.routes.ts';

// routes and middlewares mirror the server object, fully typed
const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
