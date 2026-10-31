import {initClient} from '@mionjs/client';
import type {MyApi} from '../router/cors.routes.ts';

// the API is on another origin; `include` sends its cookies, which needs `credentials: true` on the server
const {routes} = initClient<MyApi>({
  baseURL: 'https://api.example.com',
  fetchOptions: {credentials: 'include'},
});

const [users] = await routes.listUsers().call();
console.log(users?.headers['x-total']);
