import {initClient} from '@mionjs/client';

// importing only the RemoteApi type from the routes module the route handler registers
import type {MyApi} from './routes-example.ts';

// Same `/api` prefix the router carries: the client builds the paths it calls from it, so leave
// baseURL at the app's own origin.
const {routes} = initClient<MyApi>({
  baseURL: 'https://my-app.example.com',
  basePath: '/api',
});

export const greeting = await routes.users.getById('USER-123').call();
