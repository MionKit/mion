import {initClient} from '@mionjs/client';

// type only, from the routes module the route handler registers
import type {MyApi} from './routes-example.ts';

// same /api prefix as the router, so baseURL stays at the app's own origin
const {routes} = initClient<MyApi>({
  baseURL: 'https://my-app.example.com',
  basePath: '/api',
});

export const greeting = await routes.users.getById('USER-123').call();
