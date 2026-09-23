import {initClient} from '@mionjs/client';

import type {MyApi} from './init.routes.ts';

// routes and middleFns mirror the server object, fully typed
const {routes, middleFns} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
