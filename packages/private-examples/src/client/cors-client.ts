import {initClient} from '@mionjs/client';
import type {MyApi} from '../router/cors.routes.ts';

const {routes} = initClient<MyApi>({
  baseURL: 'https://api.example.com',
  // needs `credentials: true` on the server
  fetchOptions: {credentials: 'include'},
});

const [users] = await routes.listUsers().call();
console.log(users?.headers['x-total']);
