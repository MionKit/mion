import {isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const [user, error, response] = await routes.users
  .getById('USER-123')
  .call({timeout: 5000});

// a middleware error, a timeout or a thrown error: both are undefined
if (!user && !error) {
  // a middleware's declared error, typed, under its name
  if (isRpcError(response.auth))
    console.log('auth failed:', response.auth.type); // 'not-authorized'
  // anything nobody declared: a timeout, an abort, a network failure, a thrown error
  for (const thrown of response['@thrownErrors'] ?? [])
    console.log('failed:', thrown.publicMessage);
}
