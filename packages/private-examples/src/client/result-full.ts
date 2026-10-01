import {isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const [user, error, response] = await routes.users.getById('USER-123').call();

// the route's own declared errors
if (error) console.log('route error:', error.type);
// each middleware's answer or declared error, at its path
if (isRpcError(response.auth)) console.log('auth error:', response.auth.type);
// a timeout, a network drop, anything nobody declared
for (const thrown of response['@thrownErrors'] ?? [])
  console.log('thrown:', thrown.type);
console.log(user?.name);
