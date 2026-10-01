import {HeadersSubset, isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './middleware-hooks.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

declare function redirectToLogin(): void;

// a fresh id for every request, the server echoes it back
middlewares.trace
  .onRequest((trace) => {
    trace(new HeadersSubset({'X-Trace-Id': crypto.randomUUID()}));
  })
  .onResponse((info) => {
    console.log('Trace:', info.traceId, 'received at', info.receivedAt);
  });

// auth takes no params, so it needs no onRequest
middlewares.auth
  .onResponse((session) => {
    console.log('Authenticated as:', session.userId);
  })
  .onError('not-authorized', (error) => {
    console.log('Auth failed:', error.errorData?.reason);
    redirectToLogin();
  });

// no middleware data in call(), onRequest sends it
const [sum, error, response] = await routes.utils.sum(5, 2).call();

// the response also keeps what the hooks got, at each middleware's path
if (isRpcError(response.auth))
  console.log('Auth error from response:', response.auth.publicMessage);
if (response.trace && !isRpcError(response.trace))
  console.log('Trace from response:', response.trace.traceId);
for (const thrown of response['@thrownErrors'] ?? [])
  console.log('Nobody declared it:', thrown.publicMessage);
if (!error) console.log(sum); // 7
