import {HeadersSubset} from '@mionjs/core';
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
const [sum, error, undeclared, middlewareResults, middlewareErrors] =
  await routes.utils.sum(5, 2).call();

// the tuple also keeps what the hooks got, by middleware id
if (middlewareErrors?.auth)
  console.log('Auth error from tuple:', middlewareErrors.auth.publicMessage);
if (middlewareResults?.trace)
  console.log('Trace from tuple:', middlewareResults.trace);
if (undeclared)
  console.log('Undeclared (nobody declared it):', undeclared.publicMessage);
if (!error) console.log(sum); // 7
