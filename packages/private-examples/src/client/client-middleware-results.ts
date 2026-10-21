import {isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './middleware-results.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const [sum, error, response] = await routes.utils.sum(5, 2).call();

// the auth middleware's answer or declared error, at its path
if (isRpcError(response.auth))
  console.log('Auth error:', response.auth.publicMessage);
else console.log('Session:', response.auth?.userId);
if (!error) console.log(sum); // 7
