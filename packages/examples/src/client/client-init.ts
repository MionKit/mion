import {initClient} from '@mionjs/client';

// importing only the RemoteApi type from server
import type {MyApi} from './init.routes.ts';

// routes and middleFns mirror the server object: every route and every middleware
// function is strongly typed, with autocompletion on its params and return value
const {routes, middleFns} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
