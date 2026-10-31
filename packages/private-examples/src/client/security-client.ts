import {isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from '../router/security.routes.ts';

const {routes} = initClient<MyApi>({
  baseURL: 'https://api.example.com',
  // needs `credentials: true` on the server
  fetchOptions: {credentials: 'include'},
});

const [users, error, response] = await routes.listUsers().call();
if (!error) console.log(users);
// a header a middleware returned, at its path
const {rateLimit} = response;
if (rateLimit && !isRpcError(rateLimit))
  console.log(rateLimit.headers['x-ratelimit-remaining']);
